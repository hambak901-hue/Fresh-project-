<?php
/**
 * @file Request.php
 * Sanitized HTTP Request Wrapper
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Request
{
    private string $method;
    private string $uri;
    private string $path;
    private array $queryParams;
    private array $body;
    private array $headers;

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $this->uri = $_SERVER['REQUEST_URI'] ?? '/';
        $parts = parse_url($this->uri);
        $this->path = $parts['path'] ?? '/';
        $this->queryParams = $_GET;
        $this->headers = $this->collectHeaders();
        $this->body = $this->parseBody();
    }

    public function getMethod(): string
    {
        return $this->method;
    }

    public function getPath(): string
    {
        return $this->path;
    }

    public function getQueryParams(): array
    {
        return $this->queryParams;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        return $this->queryParams[$key] ?? $default;
    }

    public function getBody(): array
    {
        return $this->body;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    public function getHeader(string $name, ?string $default = null): ?string
    {
        $normalized = strtolower($name);
        return $this->headers[$normalized] ?? $default;
    }

    public function getBearerToken(): ?string
    {
        $authHeader = $this->getHeader('authorization');
        if ($authHeader && preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            return trim($matches[1]);
        }
        return null;
    }

    public function getIp(): string
    {
        return $_SERVER['HTTP_CF_CONNECTING_IP'] 
            ?? $_SERVER['HTTP_X_FORWARDED_FOR'] 
            ?? $_SERVER['REMOTE_ADDR'] 
            ?? '127.0.0.1';
    }

    private function parseBody(): array
    {
        $contentType = $this->getHeader('content-type', '');
        if (str_contains($contentType, 'application/json')) {
            $raw = file_get_contents('php://input');
            if (!empty($raw)) {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    return $this->sanitizeArray($decoded);
                }
            }
        }
        return $this->sanitizeArray($_POST);
    }

    private function collectHeaders(): array
    {
        $headers = [];
        foreach ($_SERVER as $key => $val) {
            if (str_starts_with($key, 'HTTP_')) {
                $headerName = strtolower(str_replace('_', '-', substr($key, 5)));
                $headers[$headerName] = $val;
            } elseif (in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH', 'AUTHORIZATION'])) {
                $headerName = strtolower(str_replace('_', '-', $key));
                $headers[$headerName] = $val;
            }
        }
        return $headers;
    }

    private function sanitizeArray(array $data): array
    {
        $clean = [];
        foreach ($data as $k => $v) {
            if (is_array($v)) {
                $clean[$k] = $this->sanitizeArray($v);
            } elseif (is_string($v)) {
                // Remove null bytes and trim
                $clean[$k] = trim(str_replace("\0", '', $v));
            } else {
                $clean[$k] = $v;
            }
        }
        return $clean;
    }
}
