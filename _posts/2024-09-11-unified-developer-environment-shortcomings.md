---
title: "Shortcomings of the Unified Development Environment in Dynamics 365"
date: 2024-09-11
categories: [Power Platform, Dynamics 365, X++]
tags: [Power Platform, Dynamics 365, X++]
---

# Shortcomings of the Unified Development Environment in Dynamics 365

With the general availability of the [Unified Development Environment](https://devblogs.microsoft.com/powerplatform/the-unified-development-environment-is-ga/), many developers working on **Microsoft Dynamics 365** solutions have started migrating to this new setup. While it brings certain benefits, there are also some challenges and shortcomings that can disrupt your workflow. In this post, we’ll discuss a few key issues you might encounter when building custom modules and how to work around them.

## 1. Label Path Issues When Building Custom Modules

One of the main issues developers face is related to how labels are generated when building custom modules. If you’ve configured a custom metadata path under the **"Custom Metadata Path"** option in the configuration mask, you might notice that labels are still generated under the wrong path, namly `AppData\Local\Microsoft\Dynamics365\RuntimeSymLinks\config`.

### The Problem

Even after specifying the metadata path for your customizations in the configuration mask, they are generated under the `RuntimeSymlinks` folder. As a result, when deploying the module, the application will fail to display your custom labels since they are not found under your custom metadata path `Resource` folder. Instead, you’ll see the literal label ID string, such as `@XXX1234`.

### The Workaround

To ensure that your custom labels are deployed correctly, you have two options:

1. **Manual Copy:** You can manually copy the generated labels from the incorrect path to your specified **custom metadata path**.
   
2. **Create a Symbolic Link:** A better and more automated solution is to create a symbolic link between the paths using the following command:

   ```cmd
   mklink /D "C:\dev\Workspaces\<Project>\Trunk\Development\Metadata\<Module>\Resources" "C:\Users\<User>\AppData\Local\Microsoft\Dynamics365\RuntimeSymLinks\<Config>\<Module>\Resources"
   ```

   Replace `<Project>`, `<Module>`, `<User>`, and `<Config>` with your actual values. This way, the deployment process will include your labels automatically, and the application will display the labels as expected.

## 2. Missing Folder Structure for Standard Application Code

In the new environment, there is no folder structured like the traditional **PackagesLocalDirectory**, which contained both the standard application code and your customizations. However, this kind of structure is essential if you’re using third-party tools such as:

- **Best Practice Checkers**
- **Custom Label Generators**
- **The Standard Trace Parser from Microsoft**

These tools often require access to the metadata, and without a proper folder structure, you won’t be able to use them effectively.

### The Solution: Creating a Symbolic Link Folder

You can use the following PowerShell script to create a folder structure that includes all the metadata from your configuration, much like the old **PackagesLocalDirectory**.

First, ensure that your system allows script execution by running the following command as an administrator:

```cmd
powershell Set-ExecutionPolicy RemoteSigned
```

Then, run the script below. This script checks if it’s running with admin privileges, reads all the configurations, and creates symbolic links for the required metadata under `C:\dev\symlinks`.

```powershell
# Check if the script is running with elevated (admin) privileges
function Test-AdminRights {
    $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-AdminRights)) {
    # If not running as admin, restart the script with elevated permissions
    $scriptPath = $MyInvocation.MyCommand.Definition
    Write-Host "Restarting script with elevated privileges..."
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
    exit
}

# Define the base path for the XPPConfig directory dynamically for the current user
$basePath = "$env:LOCALAPPDATA\Microsoft\Dynamics365\XPPConfig"
$symlinkBasePath = "C:\dev\symlinks"

# Function to create symbolic link for combined folders
function Create-SymbolicLink {
    param (
        [string]$FrameworkDirectory,
        [string]$ModelStoreFolder,
        [string]$LinkName
    )

    $frameworkSubdirs = Get-ChildItem -Directory -Path $FrameworkDirectory
    $modelStoreSubdirs = Get-ChildItem -Directory -Path $ModelStoreFolder

    # Define the full path for the symlink
    $linkPath = Join-Path -Path $symlinkBasePath -ChildPath $LinkName

    # Delete the symbolic link folder if it already exists
    if (Test-Path -Path $linkPath) {
        Remove-Item -Path $linkPath -Recurse -Force
        Write-Host "Deleted existing folder: $linkPath"
    }

    # Create the base symbolic link folder
    New-Item -ItemType Directory -Path $linkPath

    # Create symbolic links for each subfolder
    foreach ($subdir in $frameworkSubdirs) {
        $targetPath = Join-Path -Path $FrameworkDirectory -ChildPath $subdir.Name
        $link = Join-Path -Path $linkPath -ChildPath $subdir.Name
        if (-not (Test-Path -Path $link)) {
            New-Item -ItemType SymbolicLink -Path $link -Target $targetPath
            Write-Host "Created symbolic link: $link -> $targetPath"
        }
    }

    foreach ($subdir in $modelStoreSubdirs) {
        $targetPath = Join-Path -Path $ModelStoreFolder -ChildPath $subdir.Name
        $link = Join-Path -Path $linkPath -ChildPath $subdir.Name
        if (-not (Test-Path -Path $link)) {
            New-Item -ItemType SymbolicLink -Path $link -Target $targetPath
            Write-Host "Created symbolic link: $link -> $targetPath"
        }
    }
}

# Get all JSON config files from the XPPConfig folder
$configFiles = Get-ChildItem -Path $basePath -Filter *.json

# Process each config file
foreach ($configFile in $configFiles) {
    try {
        # Read the JSON file
        $jsonContent = Get-Content -Path $configFile.FullName | ConvertFrom-Json

        # Extract FrameworkDirectory and ModelStoreFolder paths
        $frameworkDirectory = $jsonContent.FrameworkDirectory
        $modelStoreFolder = $jsonContent.ModelStoreFolder

        # Get the file name without extension to use as the symbolic link root folder name
        $linkName = [System.IO.Path]::GetFileNameWithoutExtension($configFile.FullName)

        # Delete the folder if it exists and create symbolic link
        Create-SymbolicLink -FrameworkDirectory $frameworkDirectory -ModelStoreFolder $modelStoreFolder -LinkName $linkName
    }
    catch {
        Write-Host "Error processing $configFile\: $_"
    }
}
```

## 3. Using the Trace Parser

If you’re using the **Trace Parser**, your server should be pointed to this:

`(localdb)\.`

Then, specify a new database, ideally using your configuration name like `<config>_trace`.

---

By following these workarounds, you can overcome some of the current shortcomings of the Unified Development Environment and continue working with your custom modules efficiently.

Let me know in the comments if you have any questions or further tips!
