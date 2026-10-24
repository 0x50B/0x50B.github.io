---
categories: Environment
tags: Environment
description: "A Chromium extension that force-starts a cloud-hosted LCS machine when Lifecycle Services still shows a stale deployed state."
---
## Force start cloud-hosted LCS machine - Chromium extension
For X++ development on D365 F&O/SCM, cloud-hosted environments are often preferred over on-premises setups.
As a developer, I usually have Contributor access in the Azure portal, so I can start and stop the machines I work on from there.

Some customers are careful about granting Azure portal access, even when it is limited to the VM blade.
To save cost, developer machines shut down automatically when they are not in use. Every morning I then start the machines I need by hand.

Without Azure portal access, the only way to start them is [lcs.dynamics.com](https://lcs.dynamics.com).
That site does not track the machine's real state. It only remembers the last state change that was triggered on the site itself.
The display drifts as soon as the machine is shut down another way, for example from Windows or from the Azure portal.

The status on [lcs.dynamics.com](https://lcs.dynamics.com) can therefore be wrong.
LCS may still show the machine as "deployed" when it is already stopped. The workaround is to run Stop in LCS first, which takes up to three minutes, and only then run Start, which takes another three minutes.

To skip that, I built an extension for Chromium-based browsers (Chrome and Edge) called:
<p>
  <a href="https://chromewebstore.google.com/detail/force-start-lcs-machine/knmfphnfkikpkafbonegkdmaciekgcpm" style="font-size: 30px; padding: 10px; border-radius: 5px;" target="_blank"><img height="30px" style="margin-right: 10px;" src="/img/posts/force-start-logo.jpg"/>Force start LCS machine</a>
</p>
![force start preview](/img/posts/force-start-preview.jpg)

When you turn it on, the extension adds a button that force-starts the machine and ignores the state LCS last remembered.

It saves the extra stop-then-start round trip, which helps anyone who works with cloud-hosted LCS machines.

## contentScript.js
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
