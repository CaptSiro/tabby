# RouteChasm Project Template

## Overview

This repository is a project template for applications built on the RouteChasm framework.

The template intentionally separates:

- Project-specific code
- Framework code
- Deployment configuration
- Runtime-generated files

A project created from this template can be deployed either:

- Natively (Apache, XAMPP, WAMP, Laragon, etc.)
- In Docker containers

The framework itself is not committed directly into the template. 
During initialization it is mounted into the project using Git subtree integration.

---

# Quick Start

## 1. Clone the Template

```bash
git clone https://github.com/CaptSiro/route-chasm-template.git <project-directory>
cd <project-directory>
```

## 2. Initialize the Project

Configuration of `bin/rc.php` script can be achieved by editing the `project.json` file present in this repository.

```bash
php bin/rc.php init
```

This command:

- Downloads and mounts the RouteChasm framework into the configured framework directory
- Creates files and directories defined by the project template
- Prepares the project for environment configuration

After successful initialization, configure the target environment.

---

## 3. Select Environment

### Docker

```bash
php bin/rc.php env docker
```

Generates deployment files for Docker-based development and hosting.

### Native Apache/XAMPP/WAMP

```bash
php bin/rc.php env native
```

Generates deployment files for native Apache hosting.

For native environments the script attempts to automatically determine the project URL path 
and configure generated files accordingly.

---

# Updating the Framework

To update the framework to the latest version:

```bash
php bin/rc.php update
```

The update process pulls changes from the configured framework repository.

---

# Cleaning Generated Files (Dangerous)

**This may delete your whole project (:**
The template can remove generated initialization files:

```bash
php bin/rc.php clean
```

This command is intended primarily for development and template maintenance.
It removes files and directories generated from the initialization template and deletes generated environment files.

---

# Project Structure

Example structure after initialization and environment selection:

```text
<project>/
├── project/
│   ├── components/
│   ├── controllers/
│   ├── models/
│   └── bootstrap.php
├── framework/
│   └── ...
├── public/
│   ├── css/
│   ├── js/
│   └── images/
├── data/
├── docker/
├── bin/
├── .env
├── .htaccess
├── index.php
└── project.json
```

Actual structure depends on the template configuration in `project.json`

---

# project.json

All `bin/rc.php` behavior is driven by configuration file `project.json`.
The RouteChasm framework may use the file some features, thus the file should remain in the repository even after initialization.

It defines:

- Where the framework comes from
- Where the framework is mounted
- What files are generated
- Environment-specific settings

Default configuration:

```json
{
    "framework": {
        "repository": "https://github.com/CaptSiro/route-chasm.git",
        "branch": "main"
    },
    "template": {
        "data": {},
        "project": {
            "components": {},
            "controllers": {},
            "models": {},
            "bootstrap.php": "<framework>/bin/bootstrap-project.php"
        },
        "public": {
            "css": {},
            "images": {},
            "js": {}
        },
        "index.php": "<framework>/bin/index.php"
    },
    "mount": {
        "assets": "./public",
        "framework": "./framework",
        "storage": "./data",
        "project": "./project",
        "www": "./../"
    }
}
```

---

## framework.branch

```json
{
    "framework": {
        "branch": "main"
    }
}
```

Framework branch used during initialization and updates. Optional, default branch: `main`.

---

## mount.www

```json
{
    "mount": {
        "www": "C:/wamp/www"
    }
}
```

Used only for native deployments.
When running:

```bash
php bin/rc.php env native
```

the script attempts to determine the project's web path relative to this directory 
and inject the result into generated deployment files.
If the process fails, you need to edit `.env` and `.htaccess` manually.

---

## template

Defines files and directories generated during initialization.
The exact structure depends on the project template and framework version.
The script can perform following tasks from the template definition:

- Creating project directories
- Copying from path in mounted directories `<framework> -> mount.framework`
- Copying from relative path (must start with `./`)
- Copying from absolute path

---

# Deployment

After initialization and environment selection, the repository is intended to be self-contained.
Typical deployment should require only:

```bash
git clone <project>
```

plus any environment-specific server configuration required by the target platform.
Framework source code is stored inside the project after initialization and can later be updated through the update command.
