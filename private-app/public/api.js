(function(){
const CFG=window.WORKOS_CONFIG;
  const ALL = ['ATTENDANCE_SELF','ATTENDANCE_VIEW_ALL','ATTENDANCE_VIEW_TEAM','AUDIT_VIEW','CONVERSION_VIEW','CONVERSION_CREATE','INCENTIVE_APPROVE','INCENTIVE_RULE_DELETE','INCENTIVE_RULE_MANAGE','INCENTIVE_SIMULATE','LEAD_ASSIGN','LEAD_CREATE','LEAD_DELETE','LEAD_EDIT','LEAD_EXPORT','LEAD_VIEW_ALL','LEAD_VIEW_OWN','LEAD_VIEW_TEAM','OPS_REPORT_VIEW','OPS_VIEW_ALL','OPS_VIEW_OWN','PARTNER_CONFLICT_DECIDE','PARTNER_CREATE','PARTNER_DELETE','PARTNER_VIEW','PAYMENT_RECORD','PRESALES_VIEW','ROLE_MANAGE','SALES_TARGET_VIEW','SERVICE_MANAGE','SETTINGS_MANAGE','SUPPORT_VIEW','USER_MANAGE'];
  const STATUSES = [['new', 'New', 1, 1], ['interested', 'Interested', 2, 0], ['not_interested', 'Not Interested', 2, 0], ['callback', 'Callback', 2, 0], ['rnr', 'RNR', 2, 0], ['invalid_number', 'Invalid Number', 2, 0], ['have_requirement_in_future', 'Have a Requirement in future', 2, 0], ['contacted', 'Contacted', 2, 1], ['qualified', 'Qualified', 3, 1], ['initial_discussion', 'Initial Discussion', 3, 1], ['proposal_sent', 'Proposal Sent', 4, 1], ['negotiation', 'Negotiation', 5, 1], ['won', 'Won', 6, 1], ['lost', 'Lost', 6, 1]].map((s) => ({ id: s[0], key: s[0], name: s[1], isActive: true, step: s[2], system: !!s[3] }));
  const FOLLOWUP_REQUIRED = ['proposal_sent', 'negotiation', 'callback'];
  let privateCsrf = '';
  async function real(method, path, body) {
    if (!privateCsrf) { const response = await fetch('/api/session'); const session = await response.json(); privateCsrf = session.csrf || ''; }
    const headers = {'Content-Type':'application/json', 'X-CSRF-Token':privateCsrf};
    const response = await fetch(CFG.apiBase + '/api' + path, {method, headers, body:body === undefined ? undefined : JSON.stringify(body)});
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.message || 'Request failed'), {status:response.status});
    if (path === '/auth/login') privateCsrf = result.csrf;
    if (path === '/auth/logout') privateCsrf = '';
    return result;
  }

window.api={mode:'live',STATUSES,FOLLOWUP_REQUIRED,ALL,CONVERSION_READY:['qualified','initial_discussion','proposal_sent','negotiation'],get:p=>real('GET',p),post:(p,b)=>real('POST',p,b),patch:(p,b)=>real('PATCH',p,b),put:(p,b)=>real('PUT',p,b),del:(p,b)=>real('DELETE',p,b),demoLogin:null,reset:()=>{throw new Error('Reset is disabled in the private app.')}};
})();