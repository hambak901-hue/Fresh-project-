<?php
/**
 * @file Router.php
 * High-performance RESTful Router for HambakTech Enterprise Portal
 */

declare(strict_types=1);

namespace HambakTech\Core;

use Throwable;

class Router
{
    private array $routes = [];

    public function get(string $pattern, callable|array $handler): self
    {
        return $this->addRoute('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable|array $handler): self
    {
        return $this->addRoute('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable|array $handler): self
    {
        return $this->addRoute('PUT', $pattern, $handler);
    }

    public function delete(string $pattern, callable|array $handler): self
    {
        return $this->addRoute('DELETE', $pattern, $handler);
    }

    public function options(string $pattern, callable|array $handler): self
    {
        return $this->addRoute('OPTIONS', $pattern, $handler);
    }

    public function addRoute(string $method, string $pattern, callable|array $handler): self
    {
        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'regex' => $this->compilePattern($pattern),
            'handler' => $handler,
        ];
        return $this;
    }

    public function dispatch(Request $request): void
    {
        $requestMethod = $request->getMethod();
        $requestPath = rtrim($request->getPath(), '/') ?: '/';

        // Strip prefix if hosted under subdirectory like /backend/
        $prefix = '/backend';
        if (str_starts_with($requestPath, $prefix)) {
            $requestPath = substr($requestPath, strlen($prefix)) ?: '/';
        }

        // Automatic CORS pre-flight handling
        if ($requestMethod === 'OPTIONS') {
            Response::json(['status' => 'preflight_ok'], 200);
            return;
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $requestMethod && $route['method'] !== 'ANY') {
                continue;
            }

            if (preg_match($route['regex'], $requestPath, $matches)) {
                $params = array_filter($matches, '\is_string', ARRAY_FILTER_USE_KEY);
                try {
                    $handler = $route['handler'];
                    if (is_array($handler) && count($handler) === 2) {
                        [$class, $method] = $handler;
                        $instance = new $class();
                        $instance->$method($request, $params);
                        return;
                    } elseif (is_callable($handler)) {
                        $handler($request, $params);
                        return;
                    }
                } catch (Throwable $e) {
                    error_log('[HambakTech Router Error]: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
                    Response::error('Server error: ' . $e->getMessage(), 500, [
                        'file' => basename($e->getFile()),
                        'line' => $e->getLine(),
                    ]);
                    return;
                }
            }
        }

        Response::notFound("Endpoint {$requestMethod} {$requestPath} not found on HambakTech production backend.");
    }

    private function compilePattern(string $pattern): string
    {
        $cleanPattern = rtrim($pattern, '/') ?: '/';
        $escaped = preg_replace('/\:([a-zA-Z0-9_]+)/', '(?P<$1>[^/]+)', $cleanPattern);
        return '#^' . $escaped . '$#';
    }
}
