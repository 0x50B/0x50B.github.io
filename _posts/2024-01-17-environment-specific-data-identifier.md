---
categories: X++
tags: X++
---
## Point in time restore and environment specific data
Usually, each system has certain data that belongs to the current environment. For instance, you have connection details that connect your current environment to another environment. 
These connection details are possibly wrong when you restore e.g. a PROD database to a TEST / UAT environment.
There are certain mechanics in place, where Microsoft deletes data when a PITR (point in time restore) happens.
[Data elements that aren't copied during restore copy](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/database/database-pitr-prod-sandbox#data-elements-that-arent-copied-during-restore-copy).

So, according to this list, encrypted fields are automatically deleted as these cannot be decrypted on a different sandbox environment (different keys).
But what if you have other data, that you would like to handle if a database is moved from one system to another?

## Environment specific data identfier table
To tackle this problem, I have created a new table which stores the environment ID (you find this ID also in LCS).
So, when a PITR is done and the system boots up with a different environment ID comparing to what is stored in this table, an event is emitted that the database has changed for the current system.

![SysEnvironmentSpecificDataIdentifier_BEC](/img/posts/SysEnvironmentSpecificDataIdentifier_BEC.png)

## Application startup handler and database environment changed event manager
When the system boots up, ApplicationStartupEventManager will emit the event onSystemStartup, which you can subscribe. 
This will be our trigger to check whether the current database still matches the one from the environment.

DatabaseEnvironmentChangedEventManager_BEC will then run the check and compare the current environment ID to the one stored in the database.
If this is not the case, another event will be emitted, onDatabaseEnvironmentChanged. Once this event is emitted, the environment ID will be updated in the table, 
so that a next system boot up will not emit the same event again.

```axapta
internal final class ApplicationStartupHandler_BEC
{
    [SubscribesTo(classStr(ApplicationStartupEventManager), staticDelegateStr(ApplicationStartupEventManager, onSystemStartup))]
    public static void ApplicationStartupEventManager_onSystemStartup()
    {
        DatabaseEnvironmentChangedEventManager_BEC::runCheck();
    }
}

internal final class DatabaseEnvironmentChangedEventManager_BEC
{
    public static void raiseDatabaseEnvironmentChanged()
    {
        DatabaseEnvironmentChangedEventManager_BEC::onDatabaseEnvironmentChanged();
    }

    static delegate void onDatabaseEnvironmentChanged() {}

    public static void runCheck()
    {
        SysEnvironmentSpecificDataIdentifier_BEC sysEnvironmentIdentifier = SysEnvironmentSpecificDataIdentifier_BEC::find(true);

        Microsoft.Dynamics.ApplicationPlatform.Environment.IApplicationEnvironment appEnv = Microsoft.Dynamics.ApplicationPlatform.Environment.EnvironmentFactory::GetApplicationEnvironment();        

        if (!appEnv || !appEnv.LCS || !appEnv.LCS.LCSEnvironmentId)
        {
            throw Exception::Error;
        }

        if (sysEnvironmentIdentifier && sysEnvironmentIdentifier.EnvironmentId != appEnv.LCS.LCSEnvironmentId)
        {
            DatabaseEnvironmentChangedEventManager_BEC::raiseDatabaseEnvironmentChanged();
        }

        ttsbegin;
        sysEnvironmentIdentifier.EnvironmentId = appEnv.LCS.LCSEnvironmentId;
        sysEnvironmentIdentifier.write();
        ttscommit;
    }
}
```

## Subscribing to onDatabaseEnvioronmentChanged
Now its up to you, where you want to handle the database changed event. Example on a parameter table level:

```axapta
public class KafkaParameters_BEC extends common
{
    [SubscribesTo(classStr(DatabaseEnvironmentChangedEventManager_BEC), staticDelegateStr(DatabaseEnvironmentChangedEventManager_BEC, onDatabaseEnvironmentChanged))]
    public static void DatabaseEnvironmentChangedEventManager_BEC_onDatabaseEnvironmentChanged()
    {
        KafkaParameters_BEC parameters = KafkaParameters_BEC::find(true);
    
        ttsbegin;
        parameters.ConnectionBootstrapServers = '<DB ENV CHANGED>';
        parameters.ConnectionSaslPassword = '';
        parameters.ConnectionSaslUsername = '';
        parameters.ConnectionEnabled = NoYes::No;
        parameters.write();
        ttscommit;
    }
}
```
