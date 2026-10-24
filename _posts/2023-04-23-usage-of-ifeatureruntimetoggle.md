---
categories: X++
tags: X++
description: "Use IFeatureRuntimeToggle to hide menus and fields with your own logic, without adding an entry to Feature Management."
---
## Usage of IFeatureRuntimeToggle to enable custom feature toggling

The [feature management](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview) framework has been around for a while, and you can use it to build your own features.

## IFeatureMetadata
A feature class registers a feature in the Feature Management workspace.

As [described](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview#what-is-a-feature-class) by Microsoft: "Features in Feature Management are defined as feature classes. A feature class implements IFeatureMetadata and uses the feature class attribute to identify itself to the Feature Management workspace. There are numerous examples of feature classes available that can be checked for enablement in code using the FeatureStateProvider API and in metadata using the FeatureClass property. Example:"

```axapta
[ExportAttribute(identifierStr(Microsoft.Dynamics.ApplicationPlatform.FeatureExposure.IFeatureMetadata))]
internal final class BankCurrencyRevalGlobalEnableFeature implements IFeatureMetadata
```

Implementing IFeatureMetadata is well documented, and there are tutorials on creating your own features with it.

## IFeatureRuntimeToggle
If you do not want an entry in the standard Feature Management workspace, but you still want the framework to hide UI elements based on your own logic, implement IFeatureRuntimeToggle like this:

```axapta
[ExportAttribute(identifierStr(Microsoft.Dynamics.ApplicationPlatform.FeatureExposure.IFeatureRuntimeToggle))]
internal final class MyRuntimeToggleFeature implements IFeatureRuntimeToggle
{
    public boolean isEnabled()
    {
        return MyFeatureImplementation::isFeatureEnabled();
    }
}
```

Menus, menu items, and table fields have a metadata property called [Feature Class](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview#how-can-feature-enablement-be-checked-in-metadata). Point it at your feature class. The feature management framework then uses that class when it decides whether the AOT object is visible and accessible.

## Why should you use this?

This is especially useful if you are an ISV building your own feature management, or if you need company-specific features.
The framework hides the UI elements for you, so you do not have to write that logic yourself in a form extension class.
The search box also leaves out menu items whose feature is switched off. As far as I know, that is not possible any other way.
