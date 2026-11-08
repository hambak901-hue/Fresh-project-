<?php
/**
 * HambakTech Enterprise - Lightweight REST Router (PHP 8.2+)
 */

declare(strict_types=1);

namespace HambakTech\Core;

class Router
{
    private array $routes = [];

    public function get(string $path, callable|array $handler): void
    {
        $this->addRoute('GET', $path, $handler);
    }

    public function post(string $path, callable|array $handler): void
    {
        $this->addRoute('POST', $path, $handler);
    }

    public function put(string $path, callable|array $handler): void
    {
        $this->addRoute('PUT', $path, $handler);
    }

    public function delete(string $path, callable|array $handler): void
    {
        $this->addRoute('DELETE', $path, $handler);
    }

    private function addRoute(string $method, string $path, callable|array $handler): void
    {
        // Normalize path
        $cleanPath = '/' . trim($path, '/');
        // Convert route parameters :param into regex pattern
        $pattern = preg_replace('/:[a-zA-Z0-9_]+/', '([^/]+)', $cleanPath);
        $pattern = '#^' . $pattern . '$#';

        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'raw_path' => $cleanPath,
            'handler' => $handler,
        ];
    }

    public function dispatch(string $method, string $uri): void
    {
        // Handle preflight OPTIONS request
        if ($method === 'OPTIONS') {
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Headers: Authorization, Content-Type, X-CSRF-Token');
            header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
            http_response_code(204);
            exit;
        }

        // Strip query string and base directory if routed under /api
        $cleanUri = parse_url($uri, PHP_URL_PATH);
        $cleanUri = '/' . trim((string)$cleanUri, '/');

        // Allow routes to match with or without leading /api
        $pathsToTest = [$cleanUri];
        if (str_starts_with($cleanUri, '/api/')) {
            $pathsToTest[] = substr($cleanUri, 4); // without /api
        } else {
            $pathsToTest[] = '/api' . $cleanUri;
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }

            foreach ($pathsToTest as $testPath) {
                if (preg_match($route['pattern'], $testPath, $matches)) {
                    array_shift($matches); // Remove full match
                    $this->executeHandler($route['handler'], $matches);
                    return;
                }
            }
        }

        Response::notFound("Endpoint {$method} {$cleanUri} not recognized");
    }

    private function executeHandler(callable|array $handler, array $params = []): void
    {
        if (is_array($handler)) {
            [$class, $action] = $handler;
            $controller = new $class();
            call_user_func_array([$controller, $action], $params);
        } else {
            call_user_func_array($handler, $params);
        }
    }
}
