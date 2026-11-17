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
    private array $routeParams = [];

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

    public function setRouteParams(array $params): void
    {
        $this->routeParams = $params;
    }

    public function param(string $key, mixed $default = null): mixed
    {
        return $this->routeParams[$key] ?? $default;
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

    public function header(string $name, ?string $default = null): ?string
    {
        return $this->getHeader($name, $default);
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
        $contentType = strtolower((string)$this->getHeader('content-type', ''));
        $raw = file_get_contents('php://input');
        if (
            str_contains($contentType, 'application/json') ||
            ($this->method !== 'GET' && empty($_POST) && is_string($raw) && $raw !== '' && (str_starts_with(ltrim($raw), '{') || str_starts_with(ltrim($raw), '[')))
        ) {
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
        if (function_exists('apache_request_headers')) {
            $apacheHeaders = apache_request_headers();
            if (is_array($apacheHeaders)) {
                foreach ($apacheHeaders as $k => $v) {
                    $headers[strtolower((string)$k)] = (string)$v;
                }
            }
        }
        foreach ($_SERVER as $key => $val) {
            if (str_starts_with($key, 'HTTP_')) {
                $headerName = strtolower(str_replace('_', '-', substr($key, 5)));
                $headers[$headerName] = (string)$val;
            } elseif (in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH', 'AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'], true)) {
                $headerName = $key === 'REDIRECT_HTTP_AUTHORIZATION'
                    ? 'authorization'
                    : strtolower(str_replace('_', '-', $key));
                if (!isset($headers[$headerName]) || $headers[$headerName] === '') {
                    $headers[$headerName] = (string)$val;
                }
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
