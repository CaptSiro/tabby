<?php

const FILE_PROJECT_JSON = __DIR__ . '/../project.json';



function is_cli(): bool {
    return php_sapi_name() === 'cli';
}

define("EOL", is_cli() ? PHP_EOL : "<br>");

function error(string $message): void {
    echo "[Error]: $message" . EOL;
    exit;
}

function message(string $message): void {
    echo "[Log]: $message" . EOL;
}

function execute(string $command, bool $simulate = true): int {
    echo "> $command" . EOL;

    if (defined('SIMULATE') || $simulate) {
        return 0;
    }

    exec($command, $output, $code);
    return $code;
}

function project_json(): ?array {
    if (($content = file_get_contents(FILE_PROJECT_JSON)) === false) {
        return null;
    }

    return json_decode($content, associative: true);
}

function json_get(array $json, string $path): mixed {
    $properties = array_filter(
        array_map(
            fn($x) => trim($x),
            explode('.', $path)
        ),
        fn($x) => !empty($x)
    );

    $current = $json;
    foreach ($properties as $property) {
        if (!is_array($current)) {
            return null;
        }

        if (is_null($value = $current[$property] ?? null)) {
            return null;
        }

        $current = $value;
    }

    return $current;
}

function json_get_or_die(array $json, string $path, ?string $file = null): mixed {
    if (is_null($value = json_get($json, $path))) {
        if (is_null($file)) {
            error("$path is not set");
            exit;
        }

        error("$path is not set in $file");
        exit;
    }

    return $value;
}

function project_mounted(array $json, string $path): ?string {
    if (preg_match("/.*<([a-zA-Z0-9-_]+)>.*/", $path, $matches)) {
        if (!is_null($mount = json_get($json, "mount.$matches[1]"))) {
            $path = str_replace("<$matches[1]>", $mount, $path);
        }
    }

    if (str_starts_with($path, "./")) {
        $path = __DIR__ .'/..'. substr($path, 1);
    }

    if (($real = realpath($path)) === false) {
        return null;
    }

    return $real;
}

function project_version(): string {
    $unknownVersion = "Unknown version";

    if (is_null($json = project_json())) {
        return $unknownVersion;
    }

    if (is_null($versionFile = project_mounted($json, "<framework>/VERSION"))) {
        return $unknownVersion;
    }

    return file_get_contents($versionFile);
}
