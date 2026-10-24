---
categories: X++
tags: X++
description: "Stop the extra IIS sites so only the AOS w3wp.exe process remains and Visual Studio can reattach without asking which process to use."
---
# Streamline Your Debugging: Simplifying Reattaching to `w3wp.exe` in Visual Studio for D365 Finance and Operations

If you’re working with Dynamics 365 Finance & Operations (D365 F&O) in Visual Studio, you’ve likely run into the annoyance of reattaching to the right `w3wp.exe` process. Every time you start debugging X++ code, Visual Studio asks you to pick from several `w3wp` processes, often with no clear hint which one is serving the F&O instance. That is slow and frustrating when you only care about the main F&O Application Object Server (AOS) instance.

You can avoid the prompt by disabling the IIS sites you do not need. The steps below leave only the AOSService process running, so there is only one `w3wp.exe` to reattach to.

---

## Why Multiple `w3wp.exe` Processes Appear

When you run D365 F&O on your local machine, several IIS sites might be up by default:
- **AOSService**: The main D365 F&O application service.
- **RetailServer**: A retail component if your environment includes it.
- **RetailCloudPos**: Another retail component related to Point of Sale.

For many developers who aren’t working with retail, only the **AOSService** process matters for debugging. Visual Studio still asks you to choose among every `w3wp` process, which adds needless friction.

## Disabling Unnecessary IIS Sites

![IIS with the retail sites stopped](/img/posts/iis-disabled-sites.png)

Stop the retail sites in IIS Manager and leave AOSService running. Only one `w3wp.exe` process then starts with the application, and Visual Studio no longer asks which process to attach to.

### Steps to Disable Unnecessary Sites

1. **Open IIS Manager**:
   - Type “IIS Manager” in your Start Menu search and open it.

2. **Locate the Sites**:
   - In the left-hand pane, expand your machine name, then click on “Sites” to view all the web applications hosted by IIS.

3. **Stop Unneeded Sites**:
   - Right-click on **RetailServer** and **RetailCloudPos** and select “Stop” for each.
   - Confirm that **AOSService** remains running.

4. **Restart IIS**:
   - Run the following command in an elevated Command Prompt to restart IIS:
     ```shell
     iisreset
     ```

5. **Reattach to Debugging in Visual Studio**:
   - When you start debugging, Visual Studio finds the single AOSService process for D365 F&O. No more guessing.

---

## Benefits of This Approach

- **Saves time**: You no longer pick the process by hand, so debugging starts faster.
- **Less frustration**: There is no list of processes to scroll through, and no trial and error.
- **Leaner environment**: Useful when you are not working on retail.

---

With the unused retail sites stopped, debugging in Visual Studio stays on the code. Happy debugging!
