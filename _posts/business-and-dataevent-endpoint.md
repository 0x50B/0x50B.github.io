## Business- and Dataevent Endpoint

There is a standard HTTP endpoint (/Classes/BusinessEventsHttpAdapter) provided by Microsoft in DFO that is supposed to be used in combination with the azure key vault.
Now, the azure key vault is probably used because the endpoint is not protected with the usual OAuth authentication, 
instead you are supposed to enter the complete URL in the key vault and, most probably, Microsoft assumes you would append an API-key of some sorts to the URL. Kind of like a webhook.

What if you need to communicate with a OAuth HTTPS protected endpoint? Fret not, that is what this blog post is all about.
