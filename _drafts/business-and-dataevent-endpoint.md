## Business and Data Event Endpoint

Microsoft ships a standard HTTP endpoint in D365 F&O, `/Classes/BusinessEventsHttpAdapter`, that is meant to be used together with Azure Key Vault.

The key vault is probably involved because the endpoint is not protected with the usual OAuth authentication. You store the full URL in the key vault, and Microsoft most likely expects you to append some kind of API key to that URL, much like a webhook.

What if the endpoint you need to call is an HTTPS endpoint protected with OAuth? Fret not: that is what this post is about.
