import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import styles from './AdminManageUsers.module.css';
import CreateUserModal from '../components/Modals/CreateUserModal';

const WORK_ACTIVITY_LOOKBACK_DAYS = 365;
const CACHE_TTL_MS = 5 * 60 * 1000;

let directoryCache = null;
let directoryCacheAt = 0;
let directoryRequestInFlight = null;

const cleanStr = (value) => String(value ?? '').replace(/\r/g, '').trim();
const normalizeEmail = (value) => cleanStr(value).toLowerCase();
const normalizeName = (value) => cleanStr(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const formatDateTime = (value) => {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
};

const daysSince = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
};

const isBannedUser = (user) => {
    if (!user?.banned_until) return false;
    const bannedUntil = new Date(user.banned_until).getTime();
    return Number.isFinite(bannedUntil) && bannedUntil > Date.now();
};

const getRole = (user) => cleanStr(user?.profile?.role || user?.user_metadata?.role || 'Unknown');
const getName = (user) => cleanStr(
    user?.profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.profile?.csr_name ||
    normalizeEmail(user?.email).split('@')[0] ||
    'Unknown User'
);
const getOffice = (user) => cleanStr(user?.profile?.office || user?.user_metadata?.office || '');
const getRegion = (user) => cleanStr(user?.profile?.region || user?.user_metadata?.region || '');

const getWorkStatus = (user) => {
    const activity = user?.work_activity;
    if (!activity?.last_activity_at) {
        return {
            key: 'none',
            label: 'No recent transaction activity',
            detail: `Not seen in the last ${WORK_ACTIVITY_LOOKBACK_DAYS} days`,
            tone: 'muted',
            days: null,
        };
    }

    const days = daysSince(activity.last_activity_at);
    if (days === null) return { key: 'none', label: 'Unknown', detail: '', tone: 'muted', days: null };
    if (days <= 14) return { key: 'working', label: 'Active Working', detail: `${days} day${days === 1 ? '' : 's'} ago`, tone: 'good', days };
    if (days <= 30) return { key: 'recent', label: 'Recent Activity', detail: `${days} days ago`, tone: 'goodSoft', days };
    if (days <= 60) return { key: 'quiet30', label: 'No Activity 30+ Days', detail: `${days} days ago`, tone: 'warn', days };
    if (days <= 90) return { key: 'quiet60', label: 'No Activity 60+ Days', detail: `${days} days ago`, tone: 'warnStrong', days };
    return { key: 'quiet90', label: 'No Activity 90+ Days', detail: `${days} days ago`, tone: 'danger', days };
};

const getCachedDirectory = async ({ force = false } = {}) => {
    const cacheIsFresh = directoryCache && (Date.now() - directoryCacheAt) < CACHE_TTL_MS;
    if (!force && cacheIsFresh) return directoryCache;
    if (!force && directoryRequestInFlight) return directoryRequestInFlight;

    const request = (async () => {
        const [authResult, profilesResult, activityResult, activeAgentsResult] = await Promise.all([
            supabase.functions.invoke('manage-users', { body: { action: 'list_users' } }),
            supabase.from('profiles').select('id, full_name, email, role, tax_vet, office, region, turborater_agent_name, csr_name'),
            supabase.rpc('get_manage_users_work_activity', { p_lookback_days: WORK_ACTIVITY_LOOKBACK_DAYS }),
            supabase.from('active_agent_registry').select('email, full_name, is_active').eq('is_active', true),
        ]);

        if (authResult.error) throw authResult.error;
        if (profilesResult.error) throw profilesResult.error;
        if (activityResult.error) throw activityResult.error;
        if (activeAgentsResult.error) throw activeAgentsResult.error;

        const authUsers = Array.isArray(authResult.data)
            ? authResult.data
            : Array.isArray(authResult.data?.users)
                ? authResult.data.users
                : [];

        const profilesByEmail = new Map(
            (profilesResult.data || [])
                .filter((profile) => normalizeEmail(profile.email))
                .map((profile) => [normalizeEmail(profile.email), profile])
        );

        const activityByEmail = new Map(
            (activityResult.data || [])
                .filter((row) => normalizeEmail(row.agent_email))
                .map((row) => [normalizeEmail(row.agent_email), row])
        );

        const activeAgentByEmail = new Map(
            (activeAgentsResult.data || [])
                .filter((row) => normalizeEmail(row.email))
                .map((row) => [normalizeEmail(row.email), row])
        );

        const merged = authUsers.map((user) => {
            const email = normalizeEmail(user.email);
            return {
                ...user,
                profile: profilesByEmail.get(email) || null,
                work_activity: activityByEmail.get(email) || null,
                active_registry: activeAgentByEmail.get(email) || null,
            };
        });

        directoryCache = merged;
        directoryCacheAt = Date.now();
        return merged;
    })().finally(() => {
        directoryRequestInFlight = null;
    });

    directoryRequestInFlight = request;
    return request;
};

const AdminManageUsers = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [pageMode, setPageMode] = useState('review');
    const [reviewQueue, setReviewQueue] = useState('active');
    const [selectedUser, setSelectedUser] = useState(null);

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [regionFilter, setRegionFilter] = useState('all');
    const [officeFilter, setOfficeFilter] = useState('all');
    const [accountFilter, setAccountFilter] = useState('all');
    const [activityFilter, setActivityFilter] = useState('all');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async ({ force = false } = {}) => {
        if (force) setRefreshing(true);
        else setLoading(true);
        setError('');

        try {
            const rows = await getCachedDirectory({ force });
            setUsers(rows);
        } catch (err) {
            setError(err?.message || 'Unable to load the user directory.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSendReset = async (email) => {
        if (!window.confirm(`Send a password reset to ${email}?`)) return;
        setFeedback('');
        setError('');

        try {
            const { data, error: resetError } = await supabase.functions.invoke('manage-users', {
                body: { action: 'send_password_reset', payload: { email } },
            });
            if (resetError) throw resetError;
            setFeedback(data?.message || `Password reset sent to ${email}.`);
            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(err?.message || 'Unable to send password reset.');
        }
    };

    const handleCreateUser = async (newUserData) => {
        setIsSaving(true);
        setError('');
        setFeedback('');

        try {
            const { data, error: createError } = await supabase.functions.invoke('manage-users', {
                body: { action: 'create_user', payload: newUserData },
            });
            if (createError) throw createError;
            setFeedback(data?.message || 'User created successfully.');
            setIsModalOpen(false);
            directoryCache = null;
            await fetchUsers({ force: true });
            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(err?.message || 'Unable to create user.');
        } finally {
            setIsSaving(false);
        }
    };


    const handleSaveProfile = async (targetUser, profileValues) => {
        setError('');
        setFeedback('');

        try {
            const { data, error: saveError } = await supabase.functions.invoke('manage-users', {
                body: {
                    action: 'update_profile',
                    payload: {
                        userId: targetUser.id,
                        currentEmail: targetUser.email,
                        profile: profileValues,
                    },
                },
            });

            if (saveError) throw saveError;

            setFeedback(data?.message || `Profile updated for ${profileValues.email || targetUser.email}.`);
            directoryCache = null;
            directoryCacheAt = 0;

            const refreshed = await getCachedDirectory({ force: true });
            setUsers(refreshed);

            const refreshedUser = refreshed.find((item) => item.id === targetUser.id) || null;
            setSelectedUser(refreshedUser);

            setTimeout(() => setFeedback(''), 4000);
            return true;
        } catch (err) {
            setError(err?.message || 'Unable to update profile.');
            return false;
        }
    };

    const handleToggleDisabled = async (targetUser) => {
        const disabled = isBannedUser(targetUser);
        const action = disabled ? 'reactivate_user' : 'disable_user';
        const verb = disabled ? 'reactivate' : 'disable';

        const confirmed = window.confirm(
            disabled
                ? `Reactivate ${targetUser.email}? They will be able to sign in again.`
                : `Disable ${targetUser.email}?\n\nThey will no longer be able to sign in, but their Auth account and historical data will remain.`
        );
        if (!confirmed) return;

        setError('');
        setFeedback('');

        try {
            const { data, error: actionError } = await supabase.functions.invoke('manage-users', {
                body: {
                    action,
                    payload: {
                        userId: targetUser.id,
                        userEmail: targetUser.email,
                    },
                },
            });

            if (actionError) throw actionError;

            setFeedback(
                data?.message ||
                `${targetUser.email} was ${disabled ? 'reactivated' : 'disabled'}.`
            );

            setSelectedUser(null);
            directoryCache = null;
            directoryCacheAt = 0;

            await fetchUsers({ force: true });

            if (!disabled) {
                setPageMode('review');
                setReviewQueue('disabled');
            }

            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(
                err?.message ||
                `Unable to ${verb} ${targetUser.email}.`
            );
        }
    };

    const handleDeleteUser = async (userId, userEmail) => {
        const confirmed = window.confirm(
            `Permanently delete ${userEmail}?\n\nUse this only for accounts that should truly be removed. This cannot be undone.`
        );
        if (!confirmed) return;

        setError('');
        setFeedback('');

        try {
            const { data, error: deleteError } = await supabase.functions.invoke('manage-users', {
                body: { action: 'delete_user', payload: { userId, userEmail } },
            });
            if (deleteError) throw deleteError;
            setFeedback(data?.message || `${userEmail} was deleted.`);
            setSelectedUser(null);
            directoryCache = null;
            await fetchUsers({ force: true });
            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(err?.message || 'Unable to delete user.');
        }
    };

    const duplicateIds = useMemo(() => {
        const groups = new Map();
        users.forEach((user) => {
            const key = normalizeName(getName(user));
            if (!key || key.length < 4) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(user.id);
        });

        const ids = new Set();
        groups.forEach((groupIds) => {
            if (groupIds.length > 1) groupIds.forEach((id) => ids.add(id));
        });
        return ids;
    }, [users]);

    const getRecommendation = (user) => {
        const disabled = isBannedUser(user);
        const role = getRole(user).toLowerCase();
        const isAgent = role === 'agent';
        const work = getWorkStatus(user);
        const loginDays = daysSince(user.last_sign_in_at);
        const createdDays = daysSince(user.created_at);
        const emailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
        const externalEmail = Boolean(normalizeEmail(user.email)) && !normalizeEmail(user.email).endsWith('@fiestainsurance.com');
        const tempEmail = /temp/i.test(getName(user)) || /temp/i.test(normalizeEmail(user.email));
        const duplicate = duplicateIds.has(user.id);
        const missingProfile = !user.profile;
        const missingCsr = isAgent && !cleanStr(user.profile?.csr_name);
        const missingAssignment = isAgent && !getOffice(user) && !getRegion(user);
        const reasons = [];

        if (disabled) {
            return { key: 'disabled', queue: 'disabled', label: 'Disabled', short: 'Already disabled', tone: 'muted', reasons: ['This account is already disabled.'] };
        }

        if (user.active_registry) {
            return {
                key: 'active',
                queue: 'active',
                label: 'Active',
                short: 'Confirmed by recent EOD activity',
                tone: 'good',
                reasons: ['This email is in the confirmed active-agent registry from recent EOD submissions.'],
            };
        }

        if (!emailConfirmed) reasons.push('Email is not confirmed.');
        if (externalEmail) reasons.push('Uses an external / non-Fiesta email.');
        if (tempEmail) reasons.push('Looks like a temporary email/account.');
        if (duplicate) reasons.push('Another Auth account has the same display name.');
        if (missingProfile) reasons.push('Auth account has no matching profile row.');
        if (missingCsr) reasons.push('Agent profile is missing CSR name.');
        if (missingAssignment) reasons.push('Agent profile has no office or region assignment.');

        if (isAgent) {
            const staleWork = work.key === 'none' || work.key === 'quiet90';
            const staleLogin = loginDays === null || loginDays >= 90;

            if (staleWork && staleLogin && (createdDays === null || createdDays >= 30)) {
                reasons.unshift(work.key === 'none' ? 'No transaction activity found in the 365-day lookback.' : `Last transaction activity was ${work.days}+ days ago.`);
                reasons.unshift(loginDays === null ? 'No login has ever been recorded.' : `Last dashboard login was ${loginDays} days ago.`);
                return {
                    key: 'disable_candidate',
                    queue: 'high_confidence',
                    label: 'Review to Disable',
                    short: 'Likely old agent account',
                    tone: 'danger',
                    reasons,
                };
            }

            if (work.key === 'quiet60' || work.key === 'quiet90' || work.key === 'none') {
                reasons.unshift(work.key === 'none' ? 'No recent transaction activity was found.' : `Agent work activity is ${work.days} days old.`);
                return {
                    key: 'verify',
                    queue: 'verify',
                    label: 'Verify Agent',
                    short: 'Check employment / account use',
                    tone: 'warn',
                    reasons,
                };
            }

            if (!emailConfirmed || externalEmail || tempEmail) {
                return {
                    key: 'email_cleanup',
                    queue: 'email_cleanup',
                    label: 'Email Cleanup',
                    short: 'Fix before MFA',
                    tone: 'purple',
                    reasons,
                };
            }

            if (duplicate) {
                return {
                    key: 'duplicate',
                    queue: 'duplicates',
                    label: 'Duplicate Review',
                    short: 'Possible duplicate person',
                    tone: 'warnStrong',
                    reasons,
                };
            }

            if (missingProfile || missingCsr || missingAssignment) {
                return {
                    key: 'profile_cleanup',
                    queue: 'profile_cleanup',
                    label: 'Profile Cleanup',
                    short: 'Fill missing profile fields',
                    tone: 'info',
                    reasons,
                };
            }

            return {
                key: 'verify',
                queue: 'verify',
                label: 'Needs Review',
                short: 'Not in confirmed active registry',
                tone: 'warn',
                reasons: ['This agent is not currently in the confirmed active-agent registry.'],
            };
        }

        if (!emailConfirmed || tempEmail) {
            return { key: 'email_cleanup', queue: 'email_cleanup', label: 'Email Cleanup', short: 'Fix before MFA', tone: 'purple', reasons };
        }

        if (duplicate) {
            return { key: 'duplicate', queue: 'duplicates', label: 'Duplicate Review', short: 'Possible duplicate person', tone: 'warnStrong', reasons };
        }

        if (missingProfile) {
            return { key: 'profile_cleanup', queue: 'profile_cleanup', label: 'Profile Cleanup', short: 'Missing profile row', tone: 'info', reasons };
        }

        if (loginDays === null && createdDays !== null && createdDays >= 90) {
            reasons.unshift('This non-agent account has never logged in.');
            return { key: 'verify', queue: 'verify', label: 'Verify Account', short: 'Never logged in', tone: 'warn', reasons };
        }

        if (loginDays !== null && loginDays >= 180) {
            reasons.unshift(`Last dashboard login was ${loginDays} days ago.`);
            return { key: 'verify', queue: 'verify', label: 'Verify Account', short: 'Long time since login', tone: 'warn', reasons };
        }

        if (externalEmail) {
            return { key: 'email_cleanup', queue: 'email_cleanup', label: 'Email Review', short: 'External email', tone: 'purple', reasons };
        }

        return { key: 'ready', queue: 'ready', label: 'Keep Active', short: 'Account looks normal', tone: 'good', reasons: ['No cleanup issue was detected from the available account signals.'] };
    };

    const usersWithRecommendations = useMemo(
        () => users.map((user) => ({ ...user, recommendation: getRecommendation(user) })),
        // duplicateIds is intentionally included because getRecommendation uses it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [users, duplicateIds]
    );

    const summary = useMemo(() => {
        return usersWithRecommendations.reduce((acc, user) => {
            const recommendation = user.recommendation;
            acc.total += 1;
            if (isBannedUser(user)) acc.disabled += 1;
            else acc.active += 1;
            if (!['active', 'ready', 'disabled'].includes(recommendation.queue)) acc.needsReview += 1;
            if (recommendation.queue === 'active') acc.confirmedActive += 1;
            if (recommendation.queue === 'high_confidence') acc.highConfidence += 1;
            if (recommendation.queue === 'profile_cleanup') acc.profileCleanup += 1;
            if (recommendation.queue === 'email_cleanup') acc.emailCleanup += 1;
            if (recommendation.queue === 'ready') acc.ready += 1;
            return acc;
        }, {
            total: 0,
            active: 0,
            disabled: 0,
            needsReview: 0,
            confirmedActive: 0,
            highConfidence: 0,
            profileCleanup: 0,
            emailCleanup: 0,
            ready: 0,
        });
    }, [usersWithRecommendations]);

    const reviewCounts = useMemo(() => {
        const counts = {
            active: 0,
            needs_review: 0,
            high_confidence: 0,
            verify: 0,
            profile_cleanup: 0,
            email_cleanup: 0,
            duplicates: 0,
            ready: 0,
            disabled: 0,
        };
        usersWithRecommendations.forEach((user) => {
            const queue = user.recommendation.queue;
            if (!['active', 'ready', 'disabled'].includes(queue)) counts.needs_review += 1;
            if (counts[queue] !== undefined) counts[queue] += 1;
        });
        return counts;
    }, [usersWithRecommendations]);

    const roles = useMemo(() => [...new Set(usersWithRecommendations.map(getRole).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [usersWithRecommendations]);
    const regions = useMemo(() => [...new Set(usersWithRecommendations.map(getRegion).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [usersWithRecommendations]);
    const offices = useMemo(() => [...new Set(usersWithRecommendations.map(getOffice).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [usersWithRecommendations]);

    const applyCommonFilters = (user) => {
        const needle = search.trim().toLowerCase();
        const role = getRole(user);
        const region = getRegion(user);
        const office = getOffice(user);
        const work = getWorkStatus(user);
        const disabled = isBannedUser(user);

        if (roleFilter !== 'all' && role !== roleFilter) return false;
        if (regionFilter !== 'all' && region !== regionFilter) return false;
        if (officeFilter !== 'all' && office !== officeFilter) return false;
        if (accountFilter === 'active' && disabled) return false;
        if (accountFilter === 'disabled' && !disabled) return false;

        if (activityFilter !== 'all') {
            if (activityFilter === 'working' && !['working', 'recent'].includes(work.key)) return false;
            if (activityFilter === '30' && !['quiet30', 'quiet60', 'quiet90'].includes(work.key)) return false;
            if (activityFilter === '60' && !['quiet60', 'quiet90'].includes(work.key)) return false;
            if (activityFilter === '90' && work.key !== 'quiet90') return false;
            if (activityFilter === 'none' && work.key !== 'none') return false;
        }

        if (!needle) return true;
        const activity = user.work_activity || {};
        return [user.email, getName(user), role, region, office, user.profile?.csr_name, activity.csr_name, activity.primary_office, user.recommendation?.label]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle);
    };

    const reviewUsers = useMemo(() => {
        return usersWithRecommendations
            .filter((user) => {
                if (reviewQueue === 'needs_review') return !['active', 'ready', 'disabled'].includes(user.recommendation.queue);
                return user.recommendation.queue === reviewQueue;
            })
            .filter(applyCommonFilters)
            .sort((a, b) => {
                const rank = { active: 0, high_confidence: 1, email_cleanup: 2, duplicates: 3, profile_cleanup: 4, verify: 5, ready: 6, disabled: 7 };
                const rankDiff = (rank[a.recommendation.queue] || 99) - (rank[b.recommendation.queue] || 99);
                if (rankDiff) return rankDiff;
                return getName(a).localeCompare(getName(b));
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usersWithRecommendations, reviewQueue, search, roleFilter, regionFilter, officeFilter, accountFilter, activityFilter]);

    const directoryUsers = useMemo(() => {
        return usersWithRecommendations
            .filter(applyCommonFilters)
            .sort((a, b) => {
                const aDisabled = isBannedUser(a);
                const bDisabled = isBannedUser(b);
                if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
                return getName(a).localeCompare(getName(b));
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usersWithRecommendations, search, roleFilter, regionFilter, officeFilter, accountFilter, activityFilter]);

    const visibleUsers = pageMode === 'review' ? reviewUsers : directoryUsers;

    const clearFilters = () => {
        setSearch('');
        setRoleFilter('all');
        setRegionFilter('all');
        setOfficeFilter('all');
        setAccountFilter('all');
        setActivityFilter('all');
    };

    const openSummaryQueue = (queue) => {
        setPageMode('review');
        setReviewQueue(queue);
        clearFilters();
    };

    return (
        <main className={styles.mainContent}>
            <div className={styles.pageHeader}>
                <div>
                    <span className={styles.eyebrow}>Admin / Account Control</span>
                    <h1>Manage Users</h1>
                    <p>Review what needs attention first, then open any account to see exactly why it was flagged and what action to take before MFA is enforced.</p>
                </div>
                <div className={styles.headerActions}>
                    <button type="button" onClick={() => fetchUsers({ force: true })} className={styles.secondaryButton} disabled={refreshing || loading}>
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <button onClick={() => setIsModalOpen(true)} className={styles.primaryButton}>+ Add User</button>
                </div>
            </div>

            {feedback && <div className={styles.feedback}>{feedback}</div>}
            {error && <div className={styles.error}>{error}</div>}

            <section className={styles.summaryGrid}>
                <SummaryCard label="Active" value={summary.confirmedActive} tone="good" active={pageMode === 'review' && reviewQueue === 'active'} onClick={() => openSummaryQueue('active')} />
                <SummaryCard label="Needs Review" value={summary.needsReview} tone="warn" active={pageMode === 'review' && reviewQueue === 'needs_review'} onClick={() => openSummaryQueue('needs_review')} />
                <SummaryCard label="Profile Cleanup" value={summary.profileCleanup} tone="info" active={pageMode === 'review' && reviewQueue === 'profile_cleanup'} onClick={() => openSummaryQueue('profile_cleanup')} />
                <SummaryCard label="Email Cleanup" value={summary.emailCleanup} tone="purple" active={pageMode === 'review' && reviewQueue === 'email_cleanup'} onClick={() => openSummaryQueue('email_cleanup')} />
                <SummaryCard label="Disabled" value={summary.disabled} active={pageMode === 'review' && reviewQueue === 'disabled'} onClick={() => openSummaryQueue('disabled')} />
            </section>

            <section className={styles.workspaceCard}>
                <div className={styles.workspaceTabs}>
                    <button type="button" className={`${styles.workspaceTab} ${pageMode === 'review' ? styles.workspaceTabActive : ''}`} onClick={() => setPageMode('review')}>
                        Account Review
                        {reviewCounts.needs_review > 0 && <span>{reviewCounts.needs_review}</span>}
                    </button>
                    <button type="button" className={`${styles.workspaceTab} ${pageMode === 'directory' ? styles.workspaceTabActive : ''}`} onClick={() => setPageMode('directory')}>
                        User Directory
                        <span>{summary.total}</span>
                    </button>
                </div>

                {pageMode === 'review' && (
                    <div className={styles.queueTabs}>
                        <QueueButton label="Active" count={reviewCounts.active} queue="active" current={reviewQueue} onClick={setReviewQueue} />
                        <QueueButton label="Needs Review" count={reviewCounts.needs_review} queue="needs_review" current={reviewQueue} onClick={setReviewQueue} />
                        <QueueButton label="Verify" count={reviewCounts.verify} queue="verify" current={reviewQueue} onClick={setReviewQueue} />
                        <QueueButton label="Profile Cleanup" count={reviewCounts.profile_cleanup} queue="profile_cleanup" current={reviewQueue} onClick={setReviewQueue} />
                        <QueueButton label="Email Cleanup" count={reviewCounts.email_cleanup} queue="email_cleanup" current={reviewQueue} onClick={setReviewQueue} />
                        <QueueButton label="Duplicates" count={reviewCounts.duplicates} queue="duplicates" current={reviewQueue} onClick={setReviewQueue} />
                        <QueueButton label="Disabled" count={reviewCounts.disabled} queue="disabled" current={reviewQueue} onClick={setReviewQueue} />
                    </div>
                )}

                <div className={styles.filterCard}>
                    <div className={styles.filterTopRow}>
                        <label className={styles.searchField}>
                            <span>Search</span>
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, CSR, office..." />
                        </label>
                        <button type="button" className={styles.clearButton} onClick={clearFilters}>Clear Filters</button>
                    </div>
                    <div className={styles.filterGrid}>
                        <FilterSelect label="Role" value={roleFilter} onChange={setRoleFilter} options={roles} />
                        <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regions} />
                        <FilterSelect label="Office" value={officeFilter} onChange={setOfficeFilter} options={offices} />
                        <label><span>Account</span><select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">All accounts</option><option value="active">Active only</option><option value="disabled">Disabled only</option></select></label>
                        <label><span>Work Activity</span><select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}><option value="all">All activity</option><option value="working">Working / recent</option><option value="30">No activity 30+ days</option><option value="60">No activity 60+ days</option><option value="90">No activity 90+ days</option><option value="none">No activity found</option></select></label>
                    </div>
                </div>

                <div className={styles.tableHeader}>
                    <div>
                        <h2>{pageMode === 'review' ? 'Account Review Queue' : 'User Directory'}</h2>
                        <p>{visibleUsers.length} account{visibleUsers.length === 1 ? '' : 's'} shown</p>
                    </div>
                    <span className={styles.cacheNote}>Work activity is server-aggregated and cached for 5 minutes.</span>
                </div>

                {loading ? (
                    <div className={styles.loadingState}>Loading accounts…</div>
                ) : visibleUsers.length === 0 ? (
                    <div className={styles.loadingState}>No accounts match this queue and filters.</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role / Assignment</th>
                                    <th>Signals</th>
                                    <th>Recommended Action</th>
                                    <th>Last Login</th>
                                    <th>Account</th>
                                    <th>Manage</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleUsers.map((user) => {
                                    const work = getWorkStatus(user);
                                    const disabled = isBannedUser(user);
                                    const recommendation = user.recommendation;
                                    const role = getRole(user);
                                    const office = getOffice(user);
                                    const region = getRegion(user);
                                    const activity = user.work_activity || {};

                                    return (
                                        <tr key={user.id} className={recommendation.queue === 'high_confidence' ? styles.reviewRowDanger : !['active', 'ready', 'disabled'].includes(recommendation.queue) ? styles.reviewRow : disabled ? styles.disabledRow : ''}>
                                            <td>
                                                <div className={styles.userIdentity}>
                                                    <strong>{getName(user)}</strong>
                                                    <span>{user.email}</span>
                                                    {user.profile?.csr_name && <small>CSR: {user.profile.csr_name}</small>}
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.assignmentCell}>
                                                    <span className={styles.roleBadge}>{role}</span>
                                                    <strong>{office || 'No office assigned'}</strong>
                                                    <span>{region || 'No region assigned'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.signalCell}>
                                                    <span className={`${styles.statusPill} ${styles[`status_${work.tone}`] || ''}`}>{work.label}</span>
                                                    {activity.last_activity_at && <span>{formatDateTime(activity.last_activity_at)}</span>}
                                                    {normalizeEmail(user.email) && !normalizeEmail(user.email).endsWith('@fiestainsurance.com') && <span className={styles.externalBadge}>External email</span>}
                                                    {duplicateIds.has(user.id) && <span className={styles.duplicateBadge}>Possible duplicate</span>}
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.recommendationCell}>
                                                    <span className={`${styles.recommendationPill} ${styles[`recommendation_${recommendation.tone}`] || ''}`}>{recommendation.label}</span>
                                                    <strong>{recommendation.short}</strong>
                                                    <span>{recommendation.reasons[0]}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.loginCell}>
                                                    <strong>{formatDateTime(user.last_sign_in_at)}</strong>
                                                    <span>{user.last_sign_in_at ? `${daysSince(user.last_sign_in_at)} day(s) ago` : 'No login recorded'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`${styles.statusPill} ${disabled ? styles.status_danger : styles.status_good}`}>{disabled ? 'Disabled' : 'Active'}</span>
                                            </td>
                                            <td>
                                                <button type="button" className={styles.manageButton} onClick={() => setSelectedUser(user)}>Manage</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className={styles.infoCard}>
                <strong>How the review queue works</strong>
                <p>Agent recommendations use both Matrix work activity and dashboard login activity. Non-agent roles are judged mainly from login/account signals so admins, regionals, supervisors, training users, and underwriters are not incorrectly treated as inactive just because they do not produce transactions.</p>
            </section>

            {selectedUser && (
                <UserManageDrawer
                    user={selectedUser}
                    recommendation={selectedUser.recommendation || getRecommendation(selectedUser)}
                    duplicate={duplicateIds.has(selectedUser.id)}
                    onClose={() => setSelectedUser(null)}
                    onReset={() => handleSendReset(selectedUser.email)}
                    onSaveProfile={(profileValues) => handleSaveProfile(selectedUser, profileValues)}
                    onToggleDisabled={() => handleToggleDisabled(selectedUser)}
                    onDelete={() => handleDeleteUser(selectedUser.id, selectedUser.email)}
                />
            )}

            {isModalOpen && <CreateUserModal onClose={() => setIsModalOpen(false)} onSave={handleCreateUser} loading={isSaving} />}
        </main>
    );
};

function UserManageDrawer({ user, recommendation, duplicate, onClose, onReset, onSaveProfile, onToggleDisabled, onDelete }) {
    const work = getWorkStatus(user);
    const activity = user.work_activity || {};
    const disabled = isBannedUser(user);
    const emailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
    const externalEmail = normalizeEmail(user.email) && !normalizeEmail(user.email).endsWith('@fiestainsurance.com');
    const [editingProfile, setEditingProfile] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState(() => ({
        full_name: user.profile?.full_name || user.user_metadata?.full_name || '',
        email: user.profile?.email || user.email || '',
        role: user.profile?.role || user.user_metadata?.role || '',
        tax_vet: user.profile?.tax_vet || '',
        office: user.profile?.office || '',
        region: user.profile?.region || '',
        turborater_agent_name: user.profile?.turborater_agent_name || '',
        csr_name: user.profile?.csr_name || '',
    }));

    useEffect(() => {
        setProfileForm({
            full_name: user.profile?.full_name || user.user_metadata?.full_name || '',
            email: user.profile?.email || user.email || '',
            role: user.profile?.role || user.user_metadata?.role || '',
            tax_vet: user.profile?.tax_vet || '',
            office: user.profile?.office || '',
            region: user.profile?.region || '',
            turborater_agent_name: user.profile?.turborater_agent_name || '',
            csr_name: user.profile?.csr_name || '',
        });
        setEditingProfile(false);
    }, [user]);

    const updateProfileField = (field, value) => {
        setProfileForm((current) => ({ ...current, [field]: value }));
    };

    const saveProfile = async () => {
        if (!cleanStr(profileForm.full_name)) {
            window.alert('Full name is required.');
            return;
        }
        if (!normalizeEmail(profileForm.email)) {
            window.alert('Email is required.');
            return;
        }
        if (!cleanStr(profileForm.role)) {
            window.alert('Role is required.');
            return;
        }

        setSavingProfile(true);
        const saved = await onSaveProfile({
            ...profileForm,
            email: normalizeEmail(profileForm.email),
            full_name: cleanStr(profileForm.full_name),
            role: cleanStr(profileForm.role),
            tax_vet: cleanStr(profileForm.tax_vet),
            office: cleanStr(profileForm.office),
            region: cleanStr(profileForm.region),
            turborater_agent_name: cleanStr(profileForm.turborater_agent_name),
            csr_name: cleanStr(profileForm.csr_name),
        });
        setSavingProfile(false);
        if (saved) setEditingProfile(false);
    };

    return (
        <div className={styles.drawerBackdrop} onMouseDown={onClose}>
            <aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}>
                <div className={styles.drawerHeader}>
                    <div>
                        <span className={styles.eyebrow}>Manage Account</span>
                        <h2>{getName(user)}</h2>
                        <p>{user.email}</p>
                    </div>
                    <button type="button" className={styles.drawerClose} onClick={onClose}>×</button>
                </div>

                <div className={`${styles.drawerRecommendation} ${styles[`drawerRecommendation_${recommendation.tone}`] || ''}`}>
                    <span>Recommended action</span>
                    <strong>{recommendation.label}</strong>
                    <p>{recommendation.short}</p>
                </div>

                <DrawerSection title="Why this account is here">
                    <ul className={styles.reasonList}>
                        {recommendation.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}
                    </ul>
                </DrawerSection>

                <DrawerSection title="Account">
                    <DetailRow label="Status" value={disabled ? 'Disabled' : 'Active'} />
                    <DetailRow label="Last login" value={formatDateTime(user.last_sign_in_at)} subvalue={user.last_sign_in_at ? `${daysSince(user.last_sign_in_at)} day(s) ago` : 'No login recorded'} />
                    <DetailRow label="Email verified" value={emailConfirmed ? 'Yes' : 'No'} />
                    <DetailRow label="Email type" value={externalEmail ? 'External / non-Fiesta' : 'Fiesta email'} />
                    <DetailRow label="Created" value={formatDateTime(user.created_at)} />
                </DrawerSection>

                <DrawerSection title="Profile">
                    <div className={styles.profileSectionHeader}>
                        <span>Supabase profiles</span>
                        {!editingProfile ? (
                            <button type="button" className={styles.editProfileButton} onClick={() => setEditingProfile(true)}>Edit Profile</button>
                        ) : (
                            <div className={styles.profileEditActions}>
                                <button type="button" className={styles.cancelProfileButton} onClick={() => setEditingProfile(false)} disabled={savingProfile}>Cancel</button>
                                <button type="button" className={styles.saveProfileButton} onClick={saveProfile} disabled={savingProfile}>
                                    {savingProfile ? 'Saving…' : 'Save Profile'}
                                </button>
                            </div>
                        )}
                    </div>

                    {editingProfile ? (
                        <div className={styles.profileFormGrid}>
                            <ProfileField label="Full name" value={profileForm.full_name} onChange={(value) => updateProfileField('full_name', value)} />
                            <ProfileField label="Email" value={profileForm.email} onChange={(value) => updateProfileField('email', value)} type="email" hint="Changing this also changes the Supabase Auth login email." />
                            <ProfileField label="Role" value={profileForm.role} onChange={(value) => updateProfileField('role', value)} />
                            <ProfileField label="Tax Vet" value={profileForm.tax_vet} onChange={(value) => updateProfileField('tax_vet', value)} />
                            <ProfileField label="Office" value={profileForm.office} onChange={(value) => updateProfileField('office', value)} placeholder="CA074" />
                            <ProfileField label="Region" value={profileForm.region} onChange={(value) => updateProfileField('region', value)} />
                            <ProfileField label="TurboRater agent name" value={profileForm.turborater_agent_name} onChange={(value) => updateProfileField('turborater_agent_name', value)} />
                            <ProfileField label="CSR name" value={profileForm.csr_name} onChange={(value) => updateProfileField('csr_name', value)} />
                        </div>
                    ) : (
                        <>
                            <DetailRow label="Full name" value={user.profile?.full_name || 'Not set'} />
                            <DetailRow label="Email" value={user.profile?.email || user.email || 'Not set'} />
                            <DetailRow label="Role" value={getRole(user)} />
                            <DetailRow label="Tax Vet" value={user.profile?.tax_vet || 'Not set'} />
                            <DetailRow label="Office" value={getOffice(user) || 'Not assigned'} />
                            <DetailRow label="Region" value={getRegion(user) || 'Not assigned'} />
                            <DetailRow label="TurboRater agent name" value={user.profile?.turborater_agent_name || 'Not configured'} />
                            <DetailRow label="CSR name" value={user.profile?.csr_name || 'Not configured'} />
                            <DetailRow label="Profile row" value={user.profile ? 'Found' : 'Missing'} />
                        </>
                    )}
                    {duplicate && <div className={styles.drawerAlert}>Possible duplicate: another Auth account uses the same display name.</div>}
                </DrawerSection>

                <DrawerSection title="Working Identity">
                    <DetailRow label="Activity" value={work.label} subvalue={activity.last_activity_at ? formatDateTime(activity.last_activity_at) : work.detail} />
                    <DetailRow label="Latest CSR" value={activity.csr_name || 'Not seen'} />
                    <DetailRow label="Latest office" value={activity.primary_office || 'Not seen'} />
                    <DetailRow label="Transaction rows" value={activity.transaction_count != null ? Number(activity.transaction_count).toLocaleString() : '0'} />
                </DrawerSection>

                <DrawerSection title="Actions">
                    <div className={styles.drawerActions}>
                        <button type="button" className={styles.actionButtonLarge} onClick={onReset}>Send Password Reset</button>
                        <button
                            type="button"
                            className={disabled ? styles.reactivateButtonLarge : styles.disableButtonLarge}
                            onClick={onToggleDisabled}
                        >
                            {disabled ? 'Reactivate Account' : 'Disable Account'}
                        </button>
                        <button type="button" className={styles.deleteButtonLarge} onClick={onDelete}>Delete Permanently</button>
                    </div>
                    <p className={styles.actionHint}>
                        {disabled
                            ? 'Reactivate restores dashboard sign-in access. Historical account data remains unchanged.'
                            : 'Disable is the recommended offboarding action. It blocks sign-in while keeping the Auth account and historical records intact.'}
                    </p>
                </DrawerSection>
            </aside>
        </div>
    );
}

function DrawerSection({ title, children }) {
    return <section className={styles.drawerSection}><h3>{title}</h3>{children}</section>;
}

function DetailRow({ label, value, subvalue }) {
    return <div className={styles.detailRow}><span>{label}</span><div><strong>{value}</strong>{subvalue && <small>{subvalue}</small>}</div></div>;
}

function ProfileField({ label, value, onChange, type = 'text', placeholder = '', hint = '' }) {
    return (
        <label className={styles.profileField}>
            <span>{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
            {hint && <small>{hint}</small>}
        </label>
    );
}

function SummaryCard({ label, value, tone = '', active = false, onClick }) {
    return (
        <button type="button" className={`${styles.summaryCard} ${tone ? styles[`summary_${tone}`] : ''} ${active ? styles.summaryCardActive : ''}`} onClick={onClick}>
            <span>{label}</span>
            <strong>{value}</strong>
        </button>
    );
}

function QueueButton({ label, count, queue, current, onClick }) {
    return (
        <button type="button" className={`${styles.queueButton} ${current === queue ? styles.queueButtonActive : ''}`} onClick={() => onClick(queue)}>
            {label}<span>{count}</span>
        </button>
    );
}

function FilterSelect({ label, value, onChange, options }) {
    return (
        <label>
            <span>{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="all">All {label.toLowerCase()}s</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
        </label>
    );
}

export default AdminManageUsers;
