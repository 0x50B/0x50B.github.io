## Force start LCS machine
In X++ development for D365 F&O/SCM, cloud-hosted environments are often preferred over on-premise setups. 
As a developer, I usually have access to the Azure Portal with a contributor role, allowing me to conveniently start and stop the machines I work with through the interface.

However, some customers are cautious about granting access to the Azure Portal, even with limited privileges to the VM portal. 
To save costs, we implement automatic shutdowns for developer machines when they are not in use. As a result, every morning, I manually start the machines I need for my development tasks.

When I lack access to the Azure Portal, I can only start the machines using [lcs.dynamics.com](https://lcs.dynamics.com). 
Unfortunately, this website doesn't keep track of the machine's current state. It only remembers the last state change triggered via the website itself. 
This leads to discrepancies when automatic shutdowns or state changes occur through other means, such as shutting down on Windows or stopping on the Azure Portal.

Consequently, the machine's status displayed on [lcs.dynamics.com](https://lcs.dynamics.com) may not accurately reflect reality. 
For example, LCS might show the machine as 'deployed' even when it's stopped. To remedy this, we must first initiate a 'stop' action on LCS, which takes up to 3 minutes to complete. 
Subsequently, we can start the machine via the 'start' option, which adds another 3 minutes to the process.

To address this inconvenience, I have created an extension for Chromium-based browsers (such as Chrome and Edge) called:
<p align="center">
  <a href="https://chrome.google.com/webstore/detail/force-start-lcs-machine/knmfphnfkikpkafbonegkdmaciekgcpm/related" style="display: inline-block; vertical-align: middle; font-size: 30px; padding: 10px; border-radius: 5px;" target="_blank"><img height="50px" src="/img/posts/force-start-logo.jpg"/>Force start LCS machine</a>
</p>
![force start preview](/img/posts/force-start-preview.jpg)

When activated, this extension introduces a new button that attempts to 'force start' the machine, overriding any previously remembered state on LCS.

This useful extension saves time and ensures smoother workflow management for cloud-hosted LCS machines, making it a valuable tool for X++ developers or consultants working in such environments.

## conentScript.js
```js
function clickButton() {
    const button = document.querySelector('[data-dyn-controlname="StartDeployment"]');
    if (button) {
        button.click();
    } else {
        console.log('LCS Force start plugin: Start button was not found');
    }
}

function addButtonToPage() {
    const stopButton = document.querySelector('[data-dyn-controlname="StopDeployment"]');
    if (stopButton) {
        const newButton = document.createElement('button');
        newButton.innerText = '► Force start';
        newButton.addEventListener('click', clickButton);
        newButton.style = 'display: none !important'
        newButton.setAttribute('type', 'button');
        newButton.setAttribute('class', 'button dynamicsButton');
        newButton.setAttribute('name', 'ForceStart');
        newButton.setAttribute('template-applied', 'true');

        stopButton.parentNode.insertBefore(newButton, stopButton.previousSibling);

        // Create a MutationObserver instance
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    newButton.style.display = stopButton.style.display;
                    newButton.style.marginLeft = '10px';
                    newButton.style.marginRight = '10px';
                }
            });
        });

        // Start observing the 'Stop Deployment' button with the configured parameters
        observer.observe(stopButton, { attributes: true });
    } else {
        console.log('LCS Force start plugin: Stop button was not found');
    }
}

window.onload = addButtonToPage;
```
