---
categories: X++
tags: X++
---
## Usage of IFeatureRuntimeToggle to enable custom feature toggling

The [feature management](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview) framework was introduced some time ago. Developing custom features using this framework is possible.

## IFeatureMetadata
Feature Classes can be developed to enroll a feature in the feature management workspace.

As [described](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview#what-is-a-feature-class) by Microsoft: "Features in Feature Management are defined as feature classes. A feature class implements IFeatureMetadata and uses the feature class attribute to identify itself to the Feature Management workspace. There are numerous examples of feature classes available that can be checked for enablement in code using the FeatureStateProvider API and in metadata using the FeatureClass property. Example:"

```axapta
[ExportAttribute(identifierStr(Microsoft.Dynamics.ApplicationPlatform.FeatureExposure.IFeatureMetadata))]
internal final class BankCurrencyRevalGlobalEnableFeature implements IFeatureMetadata
```

The implementation of IFeatureMetadata is well-documented, and you can even find tutorials on creating your own custom features using it.

## IFeatureRuntimeToggle
However, if you don't want to create a feature for the standard feature management framework but still wish to utilize the framework's ability to automatically hide specific UI elements based on your custom logic, you can achieve this by using the IFeatureRuntimeToggle as follows:

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

For menus, menu items, and table fields, there's a metadata property called [Feature Class](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview#how-can-feature-enablement-be-checked-in-metadata). You can use this property to define your feature class, which the feature management framework will consult when determining the visibility and accessibility of the specified AOT object.

## Why should you use this?

This approach is especially beneficial for implementing your own feature management as an ISV or for creating company-specific features. 
By utilizing the framework's capabilities to automatically hide UI elements, you can avoid writing extra code in, for example, a form extension class. 
Additionally, the search box will exclude untoggled menu items, which, to the best of my knowledge, would not be possible otherwise.
