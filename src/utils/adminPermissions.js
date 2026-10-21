// Hardcoded admin features. Missing permissions preserve existing full admin access.
export const ADMIN_FEATURES = [
 ['dashboard','Dashboard','/admin'], ['tickets','Manage Tickets','/admin/tickets'],
 ['quotes','Quote Operations','/admin/quote-log'], ['office_numbers','Office Numbers','/admin/office-numbers'],
 ['office_eods','Office EODs','/admin/office-eods'], ['offices','Office Management','/admin/offices'],
 ['manage_users','Manage Users','/admin/manage-users'], ['violations','Manage Violations','/admin/violations'],
 ['tax_commission','Tax Commission Log','/admin/commission'], ['eod_calendar','EOD Data Calendar','/admin/commission-upload'],
 ['marketing','Marketing Operations','/admin/marketing'], ['agent_commissions','Agent Commissions','/admin/tax-wip']
];
export const permissionValue = (permissions, key) => permissions?.[key] !== false;
export const officeLevel = permissions => permissions?.office_management === 'directory' ? 'directory' : permissions?.office_management === 'none' || permissions?.offices === false ? 'none' : 'full';
export const canAccess = (permissions, key) => key === 'offices' ? officeLevel(permissions) !== 'none' : permissionValue(permissions,key);
export function featureForPath(path) {
 if (!path.startsWith('/admin')) return null;
 if (path === '/admin' || path === '/admin/') return 'dashboard';
 if (path.startsWith('/admin/enter-violation')) return 'violations';
 const sorted = [...ADMIN_FEATURES].sort((a,b)=>b[2].length-a[2].length);
 return sorted.find(([, ,route])=>path===route || path.startsWith(route+'/'))?.[0] || null;
}
