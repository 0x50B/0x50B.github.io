---
categories: X++
tags: X++
---
# Changes in SharePoint Authentication with Dynamics 365 Finance Update 10.0.40

Dynamics 365 Finance version 10.0.40 changes how SharePoint authentication works. Any integration that still uses the previous model is affected. If you call SharePoint APIs from Dynamics 365, prepare before the new model becomes mandatory in version 10.0.42. Here is what you need to know.

## Key Changes in SharePoint Authentication

![Decompiled SharePointHelper in Microsoft.Dynamics.Platform.Integration.SharePoint.dll](/img/posts/ISharePointProxy.png)
Decompilation of Microsoft.Dynamics.Platform.Integration.SharePoint.dll / SharePointHelper

1. **Deprecation of Existing SharePoint Authentication**  
   The authentication mechanism previously used for SharePoint is being removed. In version 10.0.40 the new SharePoint user authentication feature is available, but still optional. It becomes mandatory in version 10.0.42.

2. **Migration Deadline**  
   By **February 28, 2025**, you must migrate to the new SharePoint authentication model. After that date, the current connection method stops working entirely.

3. **Impact on Token Generation via SharePoint Proxy**  
   The `SharePointHelper::createProxy` method, which was previously used to obtain a SharePoint proxy with an access token, is now deprecated and marked for removal by version 10.0.42. Calling this method:
   ```xpp
   SharePointHelper::createProxy(
       docuParameters.DefaultSharePointServer,
       '/',
       xUserInfo::getCurrentUserExternalId()
   );
   ```
   no longer returns a proxy with an access token. While debugging you may still see a token on `LegacyTokenAuthenticator`, but that class is now internal and cannot be used from your code.

## One-time registration process
According to Microsoft, run this script so the application can access SharePoint after 10.0.40 from non-interactive sessions.
[Microsoft Learn: Configure document management | One-time registration process](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/organization-administration/configure-document-management#one-time-registration-process)

```ps
Import-Module Microsoft.Graph
   
# The parameter for TenantId needs to be changed
Connect-MgGraph -TenantId microsoft.onmicrosoft.com -Scopes 'Application.ReadWrite.All'
    
# These AppIds do not change as they are the first party application IDs
$erpServicePrincipal = Get-MgServicePrincipal -Filter "AppId eq '00000015-0000-0000-c000-000000000000'"
$sharePointServicePrincipal = Get-MgServicePrincipal -Filter "AppId eq '00000003-0000-0ff1-ce00-000000000000'"
$spAppRole = $sharePointServicePrincipal.AppRoles | where {$_.Value -eq 'Sites.ReadWrite.All'}
    
# Assign the SharePoint 'Sites.ReadWrite.All' permission to the Microsoft Dynamics 365 finance and operations application
New-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $erpServicePrincipal.Id -PrincipalId $erpServicePrincipal.Id -ResourceId $sharePointServicePrincipal.Id -AppRoleId $spAppRole.Id
```

## What Can Be Used Instead?

### **Temporary Solution: SharePointTokenFactory**
If SharePoint API calls fail with `401 Unauthorized`, this method still returns an access token:
   ```xpp
   using Microsoft.Dynamics.Platform.Integration.SharePoint;

   SharePointTokenFactory::GetToken(userId, domain);
   ```
The return value is a bearer token you can send with SharePoint API requests. Be careful with it: the method is not currently marked as deprecated, but nothing guarantees it will stay. Keep an eye on Microsoft's updates.

### **Long-Term Solution: Entra ID App Registration**
For a durable integration, create an app registration in **Microsoft Entra ID** (formerly Azure Active Directory) and issue your own access tokens with either:
- Client and secret authentication, or
- Certificate-based authentication.

That follows Microsoft's recommended approach and leaves you in a better position when the authentication model changes again.

## Next Steps

- **Audit Your Current Integrations:** Check where `SharePointHelper::createProxy` or similar methods are being used and plan for their removal.  
- **Implement Token Generation:** Use `SharePointTokenFactory::GetToken` as a short-term workaround while transitioning to app registration.  
- **Prepare for Mandatory Updates:** Begin configuring app registrations in Entra ID to handle token-based authentication.  

Doing this before the deadline keeps the SharePoint integration working when the current authentication model is retired.

## Useful Resources

- [Microsoft Documentation: Registering an App in Entra ID](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)  
- [Dynamics 365 Finance and Operations Release Notes](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/removed-deprecated-features-platform-updates#sharepoint-integration-authentication-using-a-microsoft-managed-high-trust-connection)

**Got questions or need further clarification?** Drop a comment below.
