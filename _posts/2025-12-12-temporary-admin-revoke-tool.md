---
layout: post
title:  "Temporary Admin Revoke Tool for Security Testing"
date:   2025-12-12 14:00:00 +0100
tags: [X++]
---

Testing security roles and permissions in Dynamics 365 Finance & Operations is tedious when you are signed in as **System Administrator**. Checking that a button is disabled, or that a form is read-only, for a normal user means logging in as a test user or asking a colleague to look.

`SysTemporaryAdminRevoke_BET` shortens that loop. It temporarily revokes your own admin rights or, if you want, applies another user's security roles to your session without switching accounts.

## How it works

The class temporarily changes rows in `SecurityUserRole` for the running session. The flow is:

1.  **Launch:** Run the class by appending `mi=SysClassRunner&cls=SysTemporaryAdminRevoke_BET` to the URL.
2.  **Configuration:** A dialog asks whether you want to mimic a specific user. That part is optional.
3.  **Revocation:**
    * If you enter a user ID, your current roles are swapped for that user's roles.
    * The **System Administrator** role is removed from your user.
4.  **Pause:** A `SysBoxForm` dialog opens. **While it stays open, your admin rights are suspended.**
5.  **Testing:** With the dialog still open, open new browser tabs and test the application with the restricted rights.
6.  **Restoration:** Closing the dialog restores the System Administrator role and undoes the role swap.

## The Code

Below is the X++ class. It uses `unchecked(Uncheck::TableSecurityPermission)` so it can still update the security tables while the rights are being changed.

```xpp
internal final class SysTemporaryAdminRevoke_BET
{
    private static const str SystemAdministrator = 'System Administrator';
    private static const str SystemUser = 'System user';

    Set revokedUserRoles = new Set(Types::String);
    Set grantedUserRoles = new Set(Types::String);

    boolean adminRevoked;
    boolean adminGranted;

    public static void main(Args _args)
    {
        Dialog dlg = new Dialog('Temporary Admin revoke tool');
        DialogField dfSysUser = dlg.addField(extendedTypeStr(SysUserId), 'Act with user rights (optional)');

        if (!dlg.run())
        {
            return;
        }

        SysTemporaryAdminRevoke_BET adminRevoke = SysTemporaryAdminRevoke_BET::construct();
        adminRevoke.actWithUserRights(dfSysUser.value());
        adminRevoke.revokeSecurityRightsPrompt();
    }

    public static SysTemporaryAdminRevoke_BET construct()
    {
        return new SysTemporaryAdminRevoke_BET();
    }

    public void actWithUserRights(str _userId)
    {
        if (!_userId)
        {
            return;
        }

        ttsbegin;
        SecurityRole        securityRole;
        SecurityUserRole    securityUserRole;
        // Revoke current user's roles (except System User and Admin)
        while select securityUserRole
            where   securityUserRole.User == curUserId()
        join securityRole
            where   securityRole.RecId == securityUserRole.SecurityRole &&
                    securityRole.Name != SystemUser &&
                    securityRole.Name != SystemAdministrator
        {
            revokedUserRoles.add(securityRole.Name);

            this.revokeSecurityRole(securityRole.Name, securityUserRole.User);
        }

        // Grant the target user's roles to the current user
        while select securityUserRole
            where   securityUserRole.User == _userId
        join securityRole
            where   securityRole.RecId == securityUserRole.SecurityRole &&
                    securityRole.Name != SystemUser &&
                    securityRole.Name != SystemAdministrator
        {
            grantedUserRoles.add(securityRole.Name);

            this.grantSecurityRole(securityRole.Name, curUserId());
        }
        ttscommit;
    }

    public void revokeSecurityRightsPrompt()
    {
        if (!hasGUI())
        {
            throw error("@ApplicationPlatform:FormOpenNonGUISession");
        }

        // Revoke Admin
        this.revokeSecurityRole(SystemAdministrator);

        // Wait for user to finish testing
        this.waitForUser();

        // Restore Admin
        this.grantSecurityRole(SystemAdministrator);

        // Restore original roles
        if (revokedUserRoles.elements())
        {
            SetEnumerator revokedUserRolesEnum = revokedUserRoles.getEnumerator();
            while (revokedUserRolesEnum.moveNext())
            {
                this.grantSecurityRole(revokedUserRolesEnum.current());
            }
        }

        // Remove temporarily granted roles
        if (grantedUserRoles.elements())
        {
            SetEnumerator grantedUserRolesEnum = grantedUserRoles.getEnumerator();
            while (grantedUserRolesEnum.moveNext())
            {
                this.revokeSecurityRole(grantedUserRolesEnum.current());
            }
        }
    }

    private void waitForUser()
    {
        Args args = new Args();
        args.name(formstr(SysBoxForm));

        FormRun formRun = classfactory.formRunClass(args);
        formRun.init();

        SysDictClass sysBoxFormDictClass = new SysDictClass(classNum(FormRun));
        sysBoxFormDictClass.callObject(formMethodStr(SysBoxForm, setText), formRun, 'You can now spawn new sessions that will have admin rights revoked to test. Close this box to regain admin access.');
        sysBoxFormDictClass.callObject(formMethodStr(SysBoxForm, setType), formRun, DialogBoxType::InfoBox);

        formRun.run();
        formRun.wait();
    }

    public void grantSecurityRole(str _roleName, UserId _userId = curUserId())
    {
        unchecked(Uncheck::TableSecurityPermission)
        {
            SecurityRole        securityRole;
            SecurityUserRole    securityUserRole;
       
            select firstOnly securityRole
                where securityRole.Name == _roleName
            outer join securityUserRole
                where   securityUserRole.SecurityRole   == securityRole.RecId &&
                        securityUserRole.User           == _userId;

            if (!securityUserRole || (securityUserRole.AssignmentStatus != RoleAssignmentStatus::Enabled))
            {
                securityUserRole.User = _userId;
                securityUserRole.SecurityRole = securityRole.RecId;
                securityUserRole.AssignmentMode = RoleAssignmentMode::Manual;
                securityUserRole.AssignmentStatus = RoleAssignmentStatus::Enabled;

                SecuritySegregationOfDuties::assignUserToRole(securityUserRole, null);

                if (_roleName == SystemAdministrator)
                {
                    adminGranted = true;
                }
            }
        }
    }

    public void revokeSecurityRole(str _roleName, UserId _userId = curUserId())
    {
        unchecked(Uncheck::TableSecurityPermission)
        {
            if (_roleName == SystemAdministrator && adminRevoked)
            {
                return;
            }

            SecurityRole                        securityRole;
            SecurityUserRole                    securityUserRole;
            SecurityUserRoleCondition           securityUserRoleCondition;

            ttsbegin;

            select firstOnly securityRole
                where securityRole.Name == _roleName;

            delete_from securityUserRoleCondition
            exists join securityUserRole
                where   securityUserRole.RecId          == securityUserRoleCondition.SecurityUserRole &&
                        securityUserRole.User           == _userId &&
                        securityUserRole.SecurityRole   == securityRole.RecId;

            OMUserRoleOrganization userRoleOrganization;
            select firstOnly OMInternalOrganization, SecurityRole from userRoleOrganization
                where   userRoleOrganization.User           == _userId &&
                        userRoleOrganization.SecurityRole   == securityRole.RecId;

            if (userRoleOrganization.SecurityRole)
            {
                EePersonalDataAccessLogging::logUserRoleChange(userRoleOrganization.SecurityRole, userRoleOrganization.omInternalOrganization, _userId, AddRemove::Remove);

                delete_from userRoleOrganization
                    where   userRoleOrganization.User           == _userId &&
                            userRoleOrganization.SecurityRole   == securityRole.RecId;
            }

            SecuritySegregationOfDutiesConflict securitySegregationOfDutiesConflict;
            delete_from securitySegregationOfDutiesConflict
                where   securitySegregationOfDutiesConflict.User            == _userId &&
                        ((securitySegregationOfDutiesConflict.ExistingRole  == securityRole.RecId) ||
                        (securitySegregationOfDutiesConflict.NewRole        == securityRole.RecId));

            EePersonalDataAccessLogging::logUserRoleChange(securityRole.RecId, 0, _userId, AddRemove::Remove);

            delete_from securityUserRole
                where   securityUserRole.User           == _userId &&
                        securityUserRole.SecurityRole   == securityRole.RecId;

            ttscommit;

            if (_roleName == SystemAdministrator)
            {
                adminRevoked = true;
            }
        }
    }
}
```

## Warnings and Considerations

* **Non-production use only:** The code is robust, but it still writes security tables directly. Use it only in dev and test environments.
* **Session state:** As soon as the `waitForUser()` dialog is open, the current session loses admin rights, and they stay revoked until the dialog is closed.
* **Crash recovery:** If the client crashes or hits a timeout while the dialog is open, you can be left without admin rights. On a Tier 1 (dev) environment, restore them with SQL or the Admin Provisioning Tool.
