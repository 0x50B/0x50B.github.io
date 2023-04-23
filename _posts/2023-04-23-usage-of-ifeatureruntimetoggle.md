## Usage of IFeatureRuntimeToggle to enable custom feature toggling

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

On menus, menu items and table fields there is a property called "FeatureClass".
You can use this property to specify your feature class that the feature management framework calls
upon deciding wether said AOT object should be visible.

This is particular useful if you want to implement your own feature management as an ISV,
or if you want to have company specific features. With only parameters you would not be able to
hide e.g. menu items in the navigation menu, or even feature specific fields without additional effort.
