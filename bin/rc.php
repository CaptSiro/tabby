<?php

require_once __DIR__ . "/lib.php";



function dir_create(string $dir): bool {
    if (file_exists($dir)) {
        message("$dir already exists");
        return true;
    }

    echo "Create: $dir" . EOL;
    return mkdir($dir, recursive: true);
}

function dir_remove(string $directory): void {
    if (!file_exists($directory) && !empty($directory)) {
        return;
    }

    $project = realpath(__DIR__ ."/..");
    if (!str_starts_with(realpath($directory), $project)) {
        echo "Warning: $directory is outside of $project. For safety reasons this script does not delete entries outside of the project directory.";
        return;
    }

    $iterator = opendir($directory);
    while(($file = readdir($iterator)) !== false) {
        if ($file === '.' || $file === '..') {
            continue;
        }

        $entry = $directory . '/' . $file;
        if (is_dir($entry)) {
            dir_remove($entry);
            continue;
        }

        file_remove($entry);
    }

    closedir($iterator);

    echo "Remove: $directory" . EOL;
    rmdir($directory);
}

function file_copy(string $source, string $destination, bool $force = false): bool {
    if (file_exists($destination) && !$force) {
        message("$destination already exists");
        return true;
    }

    echo "Copy: $source -> $destination" . EOL;
    return copy($source, $destination);
}

function file_remove(string $file): void {
    if (!file_exists($file) && !empty($directory)) {
        return;
    }

    $project = realpath(__DIR__ ."/..");
    if (($f = realpath($file)) === false) {
        return;
    }

    if (!str_starts_with($f, $project)) {
        echo "Warning: $file is outside of $project. For safety reasons this script does not delete entries outside of the project directory.";
        return;
    }

    echo "Remove: $file" . EOL;
    unlink($file);
}

function template_create(array $json, string $root, array $template): void {
    foreach ($template as $entry => $item) {
        $path = $root . DIRECTORY_SEPARATOR . $entry;

        if (is_string($item)) {
            if (!is_null($source = project_mounted($item, $json))) {
                file_copy($source, $path);
            }

            continue;
        }

        if (!is_array($item)) {
            $type = gettype($item);
            error("Entry type '$type' is not supported");
        }

        dir_create($path);
        template_create($json, $path, $item);
    }
}

function template_delete(string $root, array $template): void {
    foreach ($template as $entry => $item) {
        $path = $root . DIRECTORY_SEPARATOR . $entry;

        if (is_dir($path)) {
            dir_remove($path);
            continue;
        }

        file_remove($path);
    }
}



if (is_null($project = project_json())) {
    error("./project.json does not exist");
}

$root = realpath(__DIR__ . '/..');
$command = $argv[1] ?? null;


function command_init(array $project, string $root): void {
    $repository = project_get("framework.repository", $project);
    $mount = project_get("mount.framework", $project);
    $branch = project_get("framework.branch", $project) ?? "main";

    if (is_null($repository) || is_null($mount)) {
        error("framework.repository or framework.location is not defined in project.json");
    }

    if (str_starts_with($mount, "./")) {
        $mount = substr($mount, 2);
    }

    if (execute("git subtree add --prefix=$mount $repository $branch", !is_cli()) > 0) {
        error("Execution of 'git subtree' command failed");
    }

    template_create($project, $root, project_get("template", $project) ?? []);

    $program = $argv[0] ?? basename(__FILE__);
    message("Run '$program env docker|native' to create environment");
}

function command_env_set_variable(string $file, string $variable, string $value): bool {
    if (($contents = file_get_contents($file)) === false) {
        return false;
    }

    $var = '$$'. strtoupper($variable) .'$$';

    file_put_contents(
        $file,
        str_replace($var, $value, $contents)
    );

    echo "Set $var = $value in $file" . EOL;
    return true;
}

function command_env_copy_files(array $project, string $root, string $environment): void {
    if (!is_null($env = project_mounted("<framework>/bin/.env.$environment", $project))) {
        file_copy($env, $root .'/.env', true);
    }

    if (!is_null($htaccess = project_mounted("<framework>/bin/.htaccess.$environment", $project))) {
        file_copy($htaccess, $root .'/.htaccess', true);
    }
}

function command_env(array $project, string $root, ?string $environment = null): void {
    switch ($environment) {
        case "docker": {
            command_env_copy_files($project, $root, $environment);
            break;
        }

        case "native": {
            command_env_copy_files($project, $root, $environment);

            if (is_null($www = project_get("mount.www", $project))) {
                break;
            }

            if (is_null($www = project_mounted($www, $project))) {
                break;
            }

            $realRoot = realpath($root);
            if (!str_starts_with($realRoot, $www)) {
                error("Cannot automatically determine web root from mount.www in ./project.json. Files .env and .htaccess needs to be edited manually");
                break;
            }

            $projectPath = trim(
                str_replace(
                    "\\",
                    '/',
                    substr($realRoot, strlen($www))
                ),
                '/'
            );

            command_env_set_variable($root .'/.env', 'PROJECT', $projectPath);
            command_env_set_variable($root .'/.htaccess', 'PROJECT', !empty($projectPath)
                ? '/'. $projectPath
                : '');

            break;
        }

        default: {
            error("Unknown environment '$environment'");
            break;
        }
    }
}

function command_update(array $project): void {
    $repository = project_get("framework.repository", $project);
    $mount = project_get("mount.framework", $project);
    $branch = project_get("framework.branch", $project) ?? "main";

    if (is_null($repository) || is_null($mount)) {
        error("framework.repository or framework.location is not defined in project.json");
    }

    if (execute("git subtree pull --prefix=$mount $repository $branch", !is_cli()) > 0) {
        error("Execution of 'git subtree' command failed");
    }
}

switch ($command) {
    case 'init': {
        command_init($project, $root);
        break;
    }

    case 'env': {
        command_env($project, $root, $argv[2] ?? null);
        break;
    }

    case "clean": {
        template_delete($root, project_get("template", $project) ?? []);
        file_remove($root .'/.env');
        file_remove($root .'/.htaccess');
        break;
    }

    case 'update': {
        command_update($project);
        break;
    }

    default: {
        message("Try different command: init, env, clean (dangerous), update");
        error("Unknown command");
    }
}