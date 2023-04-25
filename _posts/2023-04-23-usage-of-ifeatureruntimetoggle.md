## Usage of IFeatureRuntimeToggle to enable custom feature toggling

The [feature management](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview) framework was introduced some time ago. Developing custom features using this framework is possible.

## IFeatureMetadata
Feature Classes can be developed to enroll a feature in the feature management workspace.

As [described](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview#what-is-a-feature-class) by Microsoft: "Features in Feature Management are defined as feature classes. A feature class implements IFeatureMetadata and uses the feature class attribute to identify itself to the Feature Management workspace. There are numerous examples of feature classes available that can be checked for enablement in code using the FeatureStateProvider API and in metadata using the FeatureClass property. Example:"

```axapta
[ExportAttribute(identifierStr(Microsoft.Dynamics.ApplicationPlatform.FeatureExposure.IFeatureMetadata))]
internal final class BankCurrencyRevalGlobalEnableFeature implements IFeatureMetadata
```

The usage of IFeatureMetadata is well documented, you will even find tutorials on how to implement you own feature.

## IFeatureRuntimeToggle
But what if you do not want to develop a feature for the standard feature management framework, but still want to leverage the frameworks capabilities to hide certain UI elements automatically, depending on your own logic? Thats possible with using the IFeatureRuntimeToggle as following:

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

On menus, menu items and table fields there is a metadata property called [Feature Class](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/get-started/feature-management/feature-management-overview#how-can-feature-enablement-be-checked-in-metadata).
You can use this property to specify your feature class that the feature management framework calls
upon, deciding wether said AOT object should be visible/accessible.

## Why should you use this?

This is particular useful if you want to implement your own feature management as an ISV, or if you want to have company specific features.
With leveraging the frameworks capabilites to hide these UI elements automatically, you do not have to write any additional code in e.g. a forms extension class.
Even the search box will filter out untoggled menu items, which otherwise would not be possible afaik.
