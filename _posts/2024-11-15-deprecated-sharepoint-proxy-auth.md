---
categories: X++
tags: X++
---
# Changes in SharePoint Authentication with Dynamics 365 Finance Update 10.0.40

With the release of Dynamics 365 Finance version 10.0.40, significant changes have been introduced to the SharePoint authentication mechanism. These updates will impact any integration with SharePoint that relies on the previous authentication model. If you use SharePoint APIs within Dynamics 365, you must prepare for these changes before they become mandatory with version 10.0.42. Here's a breakdown of what you need to know.

## Key Changes in SharePoint Authentication

![context helper](/img/posts/ISharePointProxy.png)

1. **Deprecation of Existing SharePoint Authentication**  
   The authentication mechanism previously used for integrating with SharePoint is being removed. As of version 10.0.40, the new SharePoint user authentication feature is available but optional. However, it will become mandatory starting with version 10.0.42.

2. **Migration Deadline**  
   By **February 28, 2025**, you must migrate to the new SharePoint authentication model. After this date, the current SharePoint connection method will stop working entirely.

3. **Impact on Token Generation via SharePoint Proxy**  
   The `SharePointHelper::createProxy` method, which was previously used to obtain a SharePoint proxy with an access token, is now deprecated and marked for removal by version 10.0.42. Calling this method:
   ```xpp
   SharePointHelper::createProxy(
       docuParameters.DefaultSharePointServer,
       '/',
       xUserInfo::getCurrentUserExternalId()
   );
   ```
   will no longer return a proxy with an access token. Although the access token might still appear when debugging (via the `LegacyTokenAuthenticator`), this class is now internal, making it inaccessible for external use.

## What Can Be Used Instead?

### **Temporary Solution: SharePointTokenFactory**
For those encountering `401 Unauthorized` errors in SharePoint API calls, the following method can be used to obtain an access token:
   ```xpp
   SharePointTokenFactory::GetToken(userId, domain);
   ```
This approach provides a bearer token that can authenticate SharePoint API requests. However, be cautious: while this method is currently not marked as deprecated, there’s no guarantee it will remain available in future updates. It is strongly recommended to monitor updates from Microsoft for any changes.

### **Long-Term Solution: Entra ID App Registration**
To future-proof your integration, consider creating an app registration in **Microsoft Entra ID** (formerly Azure Active Directory). Using this approach, you can generate your own access tokens with either:
- Client and secret authentication, or
- Certificate-based authentication.

This ensures compliance with Microsoft’s recommended practices and prepares your system for any further changes in authentication models.

## Next Steps

- **Audit Your Current Integrations:** Check where `SharePointHelper::createProxy` or similar methods are being used and plan for their removal.  
- **Implement Token Generation:** Use `SharePointTokenFactory::GetToken` as a short-term workaround while transitioning to app registration.  
- **Prepare for Mandatory Updates:** Begin configuring app registrations in Entra ID to handle token-based authentication.  

The upcoming updates underscore the importance of aligning with Microsoft’s evolving security protocols. By taking proactive steps now, you can ensure uninterrupted integration with SharePoint and avoid disruptions when the current authentication model is retired.

## Useful Resources

- [Microsoft Documentation: Registering an App in Entra ID](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)  
- [Dynamics 365 Finance and Operations Release Notes](https://learn.microsoft.com/en-us/dynamics365/release-plans/)  

**Got questions or need further clarification?** Drop a comment below
