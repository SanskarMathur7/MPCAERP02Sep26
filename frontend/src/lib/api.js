import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API_BASE,
    timeout: 20000,
});

// Attach persona (role) + optional email to every request so backend RBAC works.
api.interceptors.request.use((config) => {
    try {
        const raw = typeof window !== "undefined" && window.localStorage.getItem("mpca_persona");
        if (raw) {
            const p = JSON.parse(raw);
            config.headers = config.headers || {};
            if (p?.id) config.headers["X-Role-Id"] = p.id;
            if (p?.email) config.headers["X-User-Email"] = p.email;
        }
    } catch (_) { /* noop */ }
    return config;
});

export const fetchMembers = async (params = {}) => {
    const { data } = await api.get("/members", { params });
    return data;
};

export const fetchMember = async (id) => {
    const { data } = await api.get(`/members/${id}`);
    return data;
};

export const createMember = async (payload) => {
    const { data } = await api.post("/members", payload);
    return data;
};

export const updateMember = async (id, payload) => {
    const { data } = await api.patch(`/members/${id}`, payload);
    return data;
};

export const deleteMember = async (id) => {
    const { data } = await api.delete(`/members/${id}`);
    return data;
};

// ---- M6 · Member categories + bulk upload ----
export const fetchMemberStats = async () => {
    const { data } = await api.get("/members/stats");
    return data;
};

export const fetchMemberCategories = async (params = {}) => {
    const { data } = await api.get("/member-categories", { params });
    return data;
};

export const createMemberCategory = async (payload) => {
    const { data } = await api.post("/member-categories", payload);
    return data;
};

export const updateMemberCategory = async (id, payload) => {
    const { data } = await api.patch(`/member-categories/${id}`, payload);
    return data;
};

export const deleteMemberCategory = async (id) => {
    const { data } = await api.delete(`/member-categories/${id}`);
    return data;
};

export const bulkUploadMembers = async (file, dryRun = false) => {
    const form = new FormData();
    form.append("file", file);
    form.append("dry_run", dryRun ? "true" : "false");
    const { data } = await api.post("/members/bulk-upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
};

export const downloadBulkTemplate = async () => {
    const { data } = await api.get("/members/bulk-upload/template");
    return data;
};

// ---- M6.1 · Membership Assignments (multi-category) ----
export const addMembershipAssignment = async (memberId, payload) => {
    const { data } = await api.post(`/members/${memberId}/memberships`, payload);
    return data;
};

export const updateMembershipAssignment = async (memberId, assignmentId, payload) => {
    const { data } = await api.patch(`/members/${memberId}/memberships/${assignmentId}`, payload);
    return data;
};

export const removeMembershipAssignment = async (memberId, assignmentId) => {
    const { data } = await api.delete(`/members/${memberId}/memberships/${assignmentId}`);
    return data;
};

export const fetchDisclosures = async (params = {}) => {
    const { data } = await api.get("/disclosures", { params });
    return data;
};

export const fetchDashboardStats = async () => {
    const { data } = await api.get("/dashboard/stats");
    return data;
};

// ---------- Phase 2: Meetings ----------
export const fetchMeetings = async (params = {}) => {
    const { data } = await api.get("/meetings", { params });
    return data;
};
export const fetchMeeting = async (id) => {
    const { data } = await api.get(`/meetings/${id}`);
    return data;
};
export const createMeeting = async (payload) => {
    const { data } = await api.post("/meetings", payload);
    return data;
};
export const updateMeeting = async (id, payload) => {
    const { data } = await api.patch(`/meetings/${id}`, payload);
    return data;
};
export const fetchResolutions = async (meetingId) => {
    const { data } = await api.get(`/meetings/${meetingId}/resolutions`);
    return data;
};
export const addResolution = async (meetingId, payload) => {
    const { data } = await api.post(`/meetings/${meetingId}/resolutions`, payload);
    return data;
};

// ---------- Phase 2: Elections ----------
export const fetchElections = async (params = {}) => {
    const { data } = await api.get("/elections", { params });
    return data;
};
export const fetchElection = async (id) => {
    const { data } = await api.get(`/elections/${id}`);
    return data;
};
export const createElection = async (payload) => {
    const { data } = await api.post("/elections", payload);
    return data;
};
export const updateElection = async (id, payload) => {
    const { data } = await api.patch(`/elections/${id}`, payload);
    return data;
};
export const fetchCandidates = async (electionId) => {
    const { data } = await api.get(`/elections/${electionId}/candidates`);
    return data;
};
export const addCandidate = async (electionId, payload) => {
    const { data } = await api.post(`/elections/${electionId}/candidates`, payload);
    return data;
};
export const castVote = async (electionId, payload) => {
    const { data } = await api.post(`/elections/${electionId}/vote`, payload);
    return data;
};
export const concludeElection = async (electionId) => {
    const { data } = await api.post(`/elections/${electionId}/conclude`);
    return data;
};

// ---------- Public: Verify ----------
export const verifyMember = async (uid) => {
    const { data } = await api.get(`/verify/${uid}`);
    return data;
};

// ---------- Phase 3: Fees ----------
export const fetchFees = async (params = {}) => {
    const { data } = await api.get("/fees", { params });
    return data;
};
export const fetchFee = async (id) => {
    const { data } = await api.get(`/fees/${id}`);
    return data;
};
export const createFee = async (payload) => {
    const { data } = await api.post("/fees", payload);
    return data;
};
export const generateInvoices = async (cycle, amount = 3000, due_date = "2025-12-31") => {
    const { data } = await api.post(`/fees/generate`, null, { params: { cycle, amount, due_date } });
    return data;
};
export const payInvoice = async (id, payment_ref = "") => {
    const { data } = await api.post(`/fees/${id}/pay`, null, { params: payment_ref ? { payment_ref } : {} });
    return data;
};

// ---------- Phase 3: Bank ----------
export const fetchBankAccounts = async () => {
    const { data } = await api.get("/bank/accounts");
    return data;
};
export const fetchBankAccount = async (id) => {
    const { data } = await api.get(`/bank/accounts/${id}`);
    return data;
};
export const createBankAccount = async (payload) => {
    const { data } = await api.post("/bank/accounts", payload);
    return data;
};
export const fetchTransactions = async (accountId) => {
    const params = accountId ? { account_id: accountId } : {};
    const { data } = await api.get("/bank/transactions", { params });
    return data;
};
export const addTransaction = async (payload) => {
    const { data } = await api.post("/bank/transactions", payload);
    return data;
};

// ---------- Phase 3: Financial Powers ----------
export const fetchFinancialPowers = async () => {
    const { data } = await api.get("/financial-powers");
    return data;
};

// ---------- Public: Member Profile + Pay Dues ----------
export const fetchMemberProfile = async (uid) => {
    const { data } = await api.get(`/member-profile/${uid}`);
    return data;
};

// ---------- Phase III.5: Org Structure (Multi-Tenant) ----------
export const fetchBodies = async (params = {}) => {
    const { data } = await api.get("/bodies", { params });
    return data;
};
export const fetchBodiesTree = async () => {
    const { data } = await api.get("/bodies/tree");
    return data;
};
export const fetchBody = async (code) => {
    const { data } = await api.get(`/bodies/${code}`);
    return data;
};
export const fetchBodySummary = async (code) => {
    const { data } = await api.get(`/bodies/${code}/summary`);
    return data;
};
export const fetchBodyChildrenActivity = async (code) => {
    const { data } = await api.get(`/bodies/${code}/children-activity`);
    return data;
};

// ---------- Phase III.6: Claims & Grant Workflow ----------
export const fetchClaims = async (params = {}) => {
    const { data } = await api.get("/claims", { params });
    return data;
};
export const fetchClaim = async (id) => {
    const { data } = await api.get(`/claims/${id}`);
    return data;
};
export const createClaim = async (payload) => {
    const { data } = await api.post("/claims", payload);
    return data;
};
export const submitClaim = async (id, action) => {
    const { data } = await api.post(`/claims/${id}/submit`, action);
    return data;
};
export const recommendClaim = async (id, action) => {
    const { data } = await api.post(`/claims/${id}/recommend`, action);
    return data;
};
export const sanctionClaim = async (id, action) => {
    const { data } = await api.post(`/claims/${id}/sanction`, action);
    return data;
};
export const disburseClaim = async (id, action) => {
    const { data } = await api.post(`/claims/${id}/disburse`, action);
    return data;
};
export const rejectClaim = async (id, action) => {
    const { data } = await api.post(`/claims/${id}/reject`, action);
    return data;
};
export const returnClaim = async (id, action) => {
    const { data } = await api.post(`/claims/${id}/return`, action);
    return data;
};
export const aiValidateClaim = async (id) => {
    const { data } = await api.post(`/claims/${id}/ai-validate`);
    return data;
};
export const fetchReturnReasons = async () => {
    const { data } = await api.get("/return-reasons");
    return data;
};
export const fetchClaimsStats = async () => {
    const { data } = await api.get("/claims-stats/summary");
    return data;
};

// ---------- Phase III.7: Body Budget Ledger + Thresholds ----------
export const fetchBudgets = async (params = {}) => {
    const { data } = await api.get("/budgets", { params });
    return data;
};
export const fetchBudget = async (body_id, fiscal_cycle = "2025-26") => {
    const { data } = await api.get(`/budgets/${body_id}`, { params: { fiscal_cycle } });
    return data;
};
export const upsertBudget = async (payload) => {
    const { data } = await api.post("/budgets", payload);
    return data;
};
export const fetchSanctionThresholds = async () => {
    const { data } = await api.get("/sanction-thresholds");
    return data;
};

// ---------- Phase III.8: Procurement & ABC ----------
export const fetchProcurement = async (params = {}) => {
    const { data } = await api.get("/procurement", { params });
    return data;
};
export const fetchProcurementOne = async (id) => {
    const { data } = await api.get(`/procurement/${id}`);
    return data;
};
export const createProcurement = async (payload) => {
    const { data } = await api.post("/procurement", payload);
    return data;
};
export const addQuotation = async (id, quote) => {
    const { data } = await api.post(`/procurement/${id}/quotations`, quote);
    return data;
};
export const awardProcurement = async (id, payload) => {
    const { data } = await api.post(`/procurement/${id}/award`, payload);
    return data;
};
export const closeProcurement = async (id) => {
    const { data } = await api.post(`/procurement/${id}/close`);
    return data;
};
export const cancelProcurement = async (id) => {
    const { data } = await api.post(`/procurement/${id}/cancel`);
    return data;
};
export const fetchABCAnalysis = async (fiscal_cycle = "2025-26") => {
    const { data } = await api.get("/finance/abc-analysis", { params: { fiscal_cycle } });
    return data;
};

// ---------- Phase IV: Player Module (M1) ----------
export const fetchPlayers = async (params = {}) => {
    const { data } = await api.get("/players", { params });
    return data;
};
export const fetchPlayer = async (pid) => {
    const { data } = await api.get(`/players/${pid}`);
    return data;
};
export const checkPlayerEligibility = async (payload) => {
    const { data } = await api.post("/players/check-eligibility", payload);
    return data;
};
export const createPlayer = async (payload) => {
    const { data } = await api.post("/players", payload);
    return data;
};
export const updatePlayer = async (id, patch) => {
    const { data } = await api.patch(`/players/${id}`, patch);
    return data;
};
export const startPlayerReview = async (id, action) => {
    const { data } = await api.post(`/players/${id}/start-review`, action);
    return data;
};
export const raisePlayerDiscrepancy = async (id, action) => {
    const { data } = await api.post(`/players/${id}/raise-discrepancy`, action);
    return data;
};
export const resubmitPlayer = async (id, action) => {
    const { data } = await api.post(`/players/${id}/resubmit`, action);
    return data;
};
export const divisionApprovePlayer = async (id, action) => {
    const { data } = await api.post(`/players/${id}/division-approve`, action);
    return data;
};
export const approvePlayer = async (id, action) => {
    const { data } = await api.post(`/players/${id}/approve`, action || {});
    return data;
};
export const reopenPlayer = async (id, action) => {
    const { data } = await api.post(`/players/${id}/reopen`, action);
    return data;
};
export const addPlayerDocument = async (id, doc_type, url, filename) => {
    const { data } = await api.post(`/players/${id}/documents`, null, { params: { doc_type, url, filename } });
    return data;
};
export const verifyPlayerDocument = async (id, doc_type, action) => {
    const { data } = await api.post(`/players/${id}/documents/${doc_type}/verify`, action);
    return data;
};
export const aiValidatePlayerDocuments = async (id) => {
    const { data } = await api.post(`/players/${id}/ai-validate-documents`);
    return data;
};
export const disqualifyPlayer = async (id, flag) => {
    const { data } = await api.post(`/players/${id}/disqualify`, flag);
    return data;
};
export const reinstatePlayer = async (id) => {
    const { data } = await api.post(`/players/${id}/reinstate`);
    return data;
};
export const fetchPlayerStats = async () => {
    const { data } = await api.get("/players-stats/summary");
    return data;
};
export const fetchTransfers = async (params = {}) => {
    const { data } = await api.get("/transfers", { params });
    return data;
};
export const createTransfer = async (payload) => {
    const { data } = await api.post("/transfers", payload);
    return data;
};
export const transferAction = async (id, stage, payload) => {
    const { data } = await api.post(`/transfers/${id}/${stage}`, payload);
    return data;
};

// ---------- Phase IV.2: Tournament Module (M2) ----------
export const fetchTournaments = async (params = {}) => {
    const { data } = await api.get("/tournaments", { params });
    return data;
};
export const fetchTournament = async (id) => {
    const { data } = await api.get(`/tournaments/${id}`);
    return data;
};
export const createTournament = async (payload) => {
    const { data } = await api.post("/tournaments", payload);
    return data;
};
export const setTournamentStatus = async (id, status) => {
    const { data } = await api.post(`/tournaments/${id}/status/${status}`);
    return data;
};
export const submitTournamentForApproval = async (id, params) => {
    const { data } = await api.post(`/tournaments/${id}/submit-for-approval`, null, { params });
    return data;
};
export const approveTournament = async (id, params) => {
    const { data } = await api.post(`/tournaments/${id}/approve`, null, { params });
    return data;
};
export const rejectTournament = async (id, params) => {
    const { data } = await api.post(`/tournaments/${id}/reject`, null, { params });
    return data;
};
export const fetchSquads = async (tid) => {
    const { data } = await api.get(`/tournaments/${tid}/squads`);
    return data;
};
export const createSquad = async (payload) => {
    const { data } = await api.post("/squads", payload);
    return data;
};
export const addPlayerToSquad = async (squadId, payload) => {
    const { data } = await api.post(`/squads/${squadId}/players`, payload);
    return data;
};
export const removePlayerFromSquad = async (squadId, playerId) => {
    const { data } = await api.delete(`/squads/${squadId}/players/${playerId}`);
    return data;
};
// ---------- Phase T1-T4 · Tournament Plan · Grant Scheme · Invoices · DA ----------
export const fetchTournamentStats = async () => {
    const { data } = await api.get("/tournaments-stats/summary");
    return data;
};
export const fetchGrantRates = async (params = {}) => {
    const { data } = await api.get("/grant-scheme/rates", { params });
    return data;
};
export const upsertGrantRate = async (rate) => {
    const { data } = await api.post("/grant-scheme/rates", rate);
    return data;
};
export const getTournamentPlan = async (tid) => {
    const { data } = await api.get(`/tournaments/${tid}/plan`);
    return data;
};
export const saveTournamentPlan = async (tid, plan) => {
    const { data } = await api.post(`/tournaments/${tid}/plan`, plan);
    return data;
};
export const previewAutoBudget = async (tid) => {
    const { data } = await api.post(`/tournaments/${tid}/plan/preview-budget`);
    return data;
};
export const submitTournamentPlan = async (tid, action) => {
    const { data } = await api.post(`/tournaments/${tid}/plan/submit`, action);
    return data;
};
export const approveTournamentPlan = async (tid, action) => {
    const { data } = await api.post(`/tournaments/${tid}/plan/approve`, action);
    return data;
};
export const returnTournamentPlan = async (tid, action) => {
    const { data } = await api.post(`/tournaments/${tid}/plan/return`, action);
    return data;
};
export const rebuildDAForms = async (tid) => {
    const { data } = await api.post(`/tournaments/${tid}/da-forms/rebuild`);
    return data;
};
export const fetchDAForms = async (params = {}) => {
    const { data } = await api.get("/match-official-da", { params });
    return data;
};
export const updateDAForm = async (did, patch) => {
    const { data } = await api.patch(`/match-official-da/${did}`, patch);
    return data;
};
export const submitDAForm = async (did) => {
    const { data } = await api.post(`/match-official-da/${did}/submit`);
    return data;
};
export const approveDAForm = async (did, params) => {
    const { data } = await api.post(`/match-official-da/${did}/approve`, null, { params });
    return data;
};
export const rejectDAForm = async (did, params) => {
    const { data } = await api.post(`/match-official-da/${did}/reject`, null, { params });
    return data;
};
export const aiExtractInvoice = async (file_url) => {
    const { data } = await api.post("/tournament-invoices/ai-extract", null, { params: { file_url } });
    return data;
};
export const fetchTournamentInvoices = async (params = {}) => {
    const { data } = await api.get("/tournament-invoices", { params });
    return data;
};
export const createTournamentInvoice = async (payload) => {
    const { data } = await api.post("/tournament-invoices", payload);
    return data;
};
export const updateTournamentInvoice = async (iid, patch) => {
    const { data } = await api.patch(`/tournament-invoices/${iid}`, patch);
    return data;
};
export const submitTournamentInvoice = async (iid) => {
    const { data } = await api.post(`/tournament-invoices/${iid}/submit`);
    return data;
};
export const approveTournamentInvoice = async (iid) => {
    const { data } = await api.post(`/tournament-invoices/${iid}/approve`);
    return data;
};
export const rejectTournamentInvoice = async (iid, reason) => {
    const { data } = await api.post(`/tournament-invoices/${iid}/reject`, null, { params: { reason } });
    return data;
};
export const fetchBudgetTracker = async (bid) => {
    const { data } = await api.get(`/tournament-budgets/${bid}/tracker`);
    return data;
};

// ---------- Sprint 0 · Shared services ----------
export const fetchSharedConstants = async () => {
    const { data } = await api.get("/shared/constants");
    return data;
};
export const fetchCanonicalRoles = async () => {
    const { data } = await api.get("/shared/roles");
    return data;
};
export const fetchWorkflows = async () => {
    const { data } = await api.get("/shared/workflows");
    return data;
};
export const fetchAuditLog = async (params = {}) => {
    const { data } = await api.get("/shared/audit-log", { params });
    return data;
};

// ---------- Sprint 4 · Governance & Compliance ----------
export const fetchDocuments = async (params = {}) => {
    const { data } = await api.get("/documents", { params });
    return data;
};
export const fetchDocument = async (did) => {
    const { data } = await api.get(`/documents/${did}`);
    return data;
};
export const createDocument = async (payload) => {
    const { data } = await api.post("/documents", payload);
    return data;
};
export const archiveDocument = async (did, note) => {
    const { data } = await api.post(`/documents/${did}/archive`, null, { params: { note } });
    return data;
};
export const fetchDocumentsExpiring = async (days = 60) => {
    const { data } = await api.get("/documents-expiring", { params: { days } });
    return data;
};
export const fetchDmsSummary = async () => {
    const { data } = await api.get("/dms-stats/summary");
    return data;
};
export const fetchCompliance = async (params = {}) => {
    const { data } = await api.get("/compliance", { params });
    return data;
};
export const fetchComplianceDashboard = async () => {
    const { data } = await api.get("/compliance/dashboard");
    return data;
};
export const createCompliance = async (payload) => {
    const { data } = await api.post("/compliance", payload);
    return data;
};
export const fileCompliance = async (cid, payload) => {
    const { data } = await api.post(`/compliance/${cid}/file`, payload);
    return data;
};
export const fetchAuditPackPreview = async (fiscal_cycle) => {
    const { data } = await api.get("/audit-pack/preview", { params: { fiscal_cycle } });
    return data;
};
export const auditPackDownloadUrl = (fiscal_cycle) => {
    const base = API_BASE;
    const qs = fiscal_cycle ? `?fiscal_cycle=${encodeURIComponent(fiscal_cycle)}` : "";
    return `${base}/audit-pack/generate.pdf${qs}`;
};

// ---------- Sprint 3 · Asset Register + HR/Payroll ----------
export const fetchAssets = async (params = {}) => {
    const { data } = await api.get("/assets", { params });
    return data;
};
export const fetchAsset = async (aid) => {
    const { data } = await api.get(`/assets/${aid}`);
    return data;
};
export const createAsset = async (payload) => {
    const { data } = await api.post("/assets", payload);
    return data;
};
export const fetchAssetSchedule = async (aid, months = 60) => {
    const { data } = await api.get(`/assets/${aid}/depreciation-schedule`, { params: { months } });
    return data;
};
export const disposeAsset = async (aid, payload) => {
    const { data } = await api.post(`/assets/${aid}/dispose`, payload);
    return data;
};
export const fetchAssetsSummary = async (params = {}) => {
    const { data } = await api.get("/assets-stats/summary", { params });
    return data;
};
export const fetchEmployees = async (params = {}) => {
    const { data } = await api.get("/employees", { params });
    return data;
};
export const createEmployee = async (payload) => {
    const { data } = await api.post("/employees", payload);
    return data;
};
export const fetchEmployeesSummary = async (params = {}) => {
    const { data } = await api.get("/employees-stats/summary", { params });
    return data;
};
export const generatePayroll = async (payload) => {
    const { data } = await api.post("/payroll/generate", payload);
    return data;
};
export const fetchPayrollRegisters = async (params = {}) => {
    const { data } = await api.get("/payroll/registers", { params });
    return data;
};
export const fetchPayrollRegister = async (rid) => {
    const { data } = await api.get(`/payroll/registers/${rid}`);
    return data;
};
export const finalisePayrollRegister = async (rid, payload) => {
    const { data } = await api.post(`/payroll/registers/${rid}/finalise`, payload);
    return data;
};
export const fetchPayrollSummary = async (params = {}) => {
    const { data } = await api.get("/payroll-stats/summary", { params });
    return data;
};

// ---------- Sprint 2 · Vendor KYC + Purchase Orders ----------
export const fetchKycSummary = async () => {
    const { data } = await api.get("/vendors-kyc/summary");
    return data;
};
export const kycAction = async (vid, action, payload) => {
    // action ∈ submit-docs | verify | reject
    const { data } = await api.post(`/vendors/${vid}/kyc/${action}`, payload);
    return data;
};
export const fetchPurchaseOrders = async (params = {}) => {
    const { data } = await api.get("/purchase-orders", { params });
    return data;
};
export const fetchPurchaseOrder = async (pid) => {
    const { data } = await api.get(`/purchase-orders/${pid}`);
    return data;
};
export const createPurchaseOrder = async (payload) => {
    const { data } = await api.post("/purchase-orders", payload);
    return data;
};
export const poAction = async (pid, action, payload) => {
    // action ∈ submit | approve | issue | mark-received | send-back | cancel
    const { data } = await api.post(`/purchase-orders/${pid}/${action}`, payload);
    return data;
};
export const linkPoBill = async (pid, payload) => {
    const { data } = await api.post(`/purchase-orders/${pid}/link-bill`, payload);
    return data;
};
export const fetchPoBurndown = async (pid) => {
    const { data } = await api.get(`/purchase-orders/${pid}/burn-down`);
    return data;
};
export const fetchPoStats = async (params = {}) => {
    const { data } = await api.get("/purchase-orders-stats/summary", { params });
    return data;
};
export const fetchDivisionGrants = async (params = {}) => {
    const { data } = await api.get("/division-grants", { params });
    return data;
};
export const fetchDivisionGrant = async (gid) => {
    const { data } = await api.get(`/division-grants/${gid}`);
    return data;
};
export const createDivisionGrant = async (payload) => {
    const { data } = await api.post("/division-grants", payload);
    return data;
};
export const grantAction = async (gid, action, payload) => {
    // action ∈ submit | finance-review | secretary-approve | disburse | send-back | reject
    const { data } = await api.post(`/division-grants/${gid}/${action}`, payload);
    return data;
};
export const fetchDivisionGrantStats = async (params = {}) => {
    const { data } = await api.get("/division-grants-stats/summary", { params });
    return data;
};
export const fetchVouchers = async (params = {}) => {
    const { data } = await api.get("/vouchers", { params });
    return data;
};
export const createVoucher = async (payload) => {
    const { data } = await api.post("/vouchers", payload);
    return data;
};
export const cancelVoucher = async (vid, reason) => {
    const { data } = await api.post(`/vouchers/${vid}/cancel`, null, { params: { reason } });
    return data;
};
export const fetchVoucherStats = async (params = {}) => {
    const { data } = await api.get("/vouchers-stats/summary", { params });
    return data;
};
export const fetchLedger = async (params = {}) => {
    const { data } = await api.get("/ledger", { params });
    return data;
};
export const ledgerExportUrl = (body_id, fiscal_cycle, format = "xlsx") => {
    const base = API_BASE;
    const fy = fiscal_cycle ? `&fiscal_cycle=${fiscal_cycle}` : "";
    return `${base}/ledger/export.${format}?body_id=${encodeURIComponent(body_id)}${fy}`;
};
export const fetchBudgetVsActual = async (params = {}) => {
    const { data } = await api.get("/finance/budget-vs-actual", { params });
    return data;
};

// ---------- Phase T5 · Extra Expense Approval ----------
export const fetchExtraExpenseRequests = async (params = {}) => {
    const { data } = await api.get("/extra-expense-requests", { params });
    return data;
};
export const createExtraExpenseRequest = async (payload) => {
    const { data } = await api.post("/extra-expense-requests", payload);
    return data;
};
export const updateExtraExpenseRequest = async (rid, patch) => {
    const { data } = await api.patch(`/extra-expense-requests/${rid}`, patch);
    return data;
};
export const submitExtraExpenseRequest = async (rid, action) => {
    const { data } = await api.post(`/extra-expense-requests/${rid}/submit`, action);
    return data;
};
export const approveExtraExpenseRequest = async (rid, action) => {
    const { data } = await api.post(`/extra-expense-requests/${rid}/approve`, action);
    return data;
};
export const rejectExtraExpenseRequest = async (rid, action) => {
    const { data } = await api.post(`/extra-expense-requests/${rid}/reject`, action);
    return data;
};
export const requestInfoOnExtraExpense = async (rid, action) => {
    const { data } = await api.post(`/extra-expense-requests/${rid}/request-info`, action);
    return data;
};
export const fetchTournamentExpenseEvents = async (tid) => {
    const { data } = await api.get(`/tournaments/${tid}/expense-events`);
    return data;
};


// ---------- Phase M2-B/M2-C: Fixtures, Match Results, Rankings, HR ----------
export const fetchFixtures = async (params = {}) => {
    const { data } = await api.get("/fixtures", { params });
    return data;
};
export const fetchFixture = async (id) => {
    const { data } = await api.get(`/fixtures/${id}`);
    return data;
};
export const createFixture = async (payload) => {
    const { data } = await api.post("/fixtures", payload);
    return data;
};
export const setFixtureStatus = async (id, status) => {
    const { data } = await api.post(`/fixtures/${id}/status/${status}`);
    return data;
};
export const allocateOfficial = async (id, payload) => {
    const { data } = await api.post(`/fixtures/${id}/officials`, payload);
    return data;
};
export const removeOfficial = async (fid, oid) => {
    const { data } = await api.delete(`/fixtures/${fid}/officials/${oid}`);
    return data;
};
export const logWorkHours = async (id, params) => {
    const { data } = await api.post(`/fixtures/${id}/log-hours`, null, { params });
    return data;
};
export const fetchFixtureStats = async (params = {}) => {
    const { data } = await api.get("/fixtures-stats/summary", { params });
    return data;
};
export const createMatchResult = async (payload) => {
    const { data } = await api.post("/match-results", payload);
    return data;
};
export const fetchMatchResults = async (params = {}) => {
    const { data } = await api.get("/match-results", { params });
    return data;
};
export const fetchBattingRankings = async (params = {}) => {
    const { data } = await api.get("/rankings/batting", { params });
    return data;
};
export const fetchBowlingRankings = async (params = {}) => {
    const { data } = await api.get("/rankings/bowling", { params });
    return data;
};
export const fetchSpecialPerformances = async (params = {}) => {
    const { data } = await api.get("/rankings/special-performances", { params });
    return data;
};
export const fetchHRWorkHours = async (params = {}) => {
    const { data } = await api.get("/hr-allocations/work-hours", { params });
    return data;
};



// ---------- F6a: Vendors + Vendor Bills ----------
export const fetchVendors = async (params = {}) => {
    const { data } = await api.get("/vendors", { params });
    return data;
};
export const createVendor = async (payload) => {
    const { data } = await api.post("/vendors", payload);
    return data;
};
export const updateVendor = async (id, payload) => {
    const { data } = await api.patch(`/vendors/${id}`, payload);
    return data;
};
export const blacklistVendor = async (id, reason) => {
    const { data } = await api.post(`/vendors/${id}/blacklist`, { reason });
    return data;
};
export const unblacklistVendor = async (id) => {
    const { data } = await api.post(`/vendors/${id}/un-blacklist`);
    return data;
};
export const deleteVendor = async (id) => {
    const { data } = await api.delete(`/vendors/${id}`);
    return data;
};

export const fetchVendorBills = async (params = {}) => {
    const { data } = await api.get("/vendor-bills", { params });
    return data;
};
export const fetchVendorBill = async (id) => {
    const { data } = await api.get(`/vendor-bills/${id}`);
    return data;
};
export const createVendorBill = async (payload) => {
    const { data } = await api.post("/vendor-bills", payload);
    return data;
};
export const submitVendorBill = async (id, action) => {
    const { data } = await api.post(`/vendor-bills/${id}/submit`, action);
    return data;
};
export const verifyVendorBill = async (id, action) => {
    const { data } = await api.post(`/vendor-bills/${id}/verify`, action);
    return data;
};
export const sanctionVendorBill = async (id, action) => {
    const { data } = await api.post(`/vendor-bills/${id}/sanction`, action);
    return data;
};
export const payVendorBill = async (id, action) => {
    const { data } = await api.post(`/vendor-bills/${id}/pay`, action);
    return data;
};
export const rejectVendorBill = async (id, action) => {
    const { data } = await api.post(`/vendor-bills/${id}/reject`, action);
    return data;
};
export const returnVendorBill = async (id, action) => {
    const { data } = await api.post(`/vendor-bills/${id}/return`, action);
    return data;
};
export const deleteVendorBill = async (id) => {
    const { data } = await api.delete(`/vendor-bills/${id}`);
    return data;
};
export const fetchVendorBillStats = async (params = {}) => {
    const { data } = await api.get("/vendor-bills-stats/summary", { params });
    return data;
};


// ---------- Phase A: Tournament Auto-Budgets ----------
export const fetchTournamentBudgets = async (params = {}) => {
    const { data } = await api.get("/tournament-budgets", { params });
    return data;
};
export const fetchTournamentBudget = async (id) => {
    const { data } = await api.get(`/tournament-budgets/${id}`);
    return data;
};
export const createTournamentBudget = async (payload) => {
    const { data } = await api.post("/tournament-budgets", payload);
    return data;
};
export const updateTournamentBudget = async (id, payload) => {
    const { data } = await api.patch(`/tournament-budgets/${id}`, payload);
    return data;
};
export const submitTournamentBudget = async (id, action) => {
    const { data } = await api.post(`/tournament-budgets/${id}/submit`, action);
    return data;
};
export const approveTournamentBudget = async (id, action) => {
    const { data } = await api.post(`/tournament-budgets/${id}/approve`, action);
    return data;
};
export const returnTournamentBudget = async (id, action) => {
    const { data } = await api.post(`/tournament-budgets/${id}/return`, action);
    return data;
};
export const rejectTournamentBudget = async (id, action) => {
    const { data } = await api.post(`/tournament-budgets/${id}/reject`, action);
    return data;
};
export const deleteTournamentBudget = async (id) => {
    const { data } = await api.delete(`/tournament-budgets/${id}`);
    return data;
};
export const addVariableItem = async (id, item) => {
    const { data } = await api.post(`/tournament-budgets/${id}/variables`, item);
    return data;
};
export const decideVariableItem = async (bid, iid, payload) => {
    const { data } = await api.post(`/tournament-budgets/${bid}/variables/${iid}/decide`, payload);
    return data;
};
export const fetchTournamentBudgetStats = async (params = {}) => {
    const { data } = await api.get("/tournament-budgets-stats/summary", { params });
    return data;
};



// ---------- Phase C: Venues + Grounds + Ground Expenses ----------
export const fetchVenues = async (params = {}) => {
    const { data } = await api.get("/venues", { params });
    return data;
};
export const createVenue = async (payload) => {
    const { data } = await api.post("/venues", payload);
    return data;
};
export const updateVenue = async (id, payload) => {
    const { data } = await api.patch(`/venues/${id}`, payload);
    return data;
};
export const deleteVenue = async (id) => {
    const { data } = await api.delete(`/venues/${id}`);
    return data;
};
export const fetchGrounds = async (params = {}) => {
    const { data } = await api.get("/grounds", { params });
    return data;
};
export const createGround = async (payload) => {
    const { data } = await api.post("/grounds", payload);
    return data;
};
export const updateGround = async (id, payload) => {
    const { data } = await api.patch(`/grounds/${id}`, payload);
    return data;
};
export const deleteGround = async (id) => {
    const { data } = await api.delete(`/grounds/${id}`);
    return data;
};
export const addGroundStaff = async (gid, staff) => {
    const { data } = await api.post(`/grounds/${gid}/staff`, staff);
    return data;
};
export const removeGroundStaff = async (gid, sid) => {
    const { data } = await api.delete(`/grounds/${gid}/staff/${sid}`);
    return data;
};
export const fetchGroundPayroll = async (gid) => {
    const { data } = await api.get(`/grounds/${gid}/payroll-summary`);
    return data;
};
export const fetchGroundExpenses = async (params = {}) => {
    const { data } = await api.get("/ground-expenses", { params });
    return data;
};
export const createGroundExpense = async (payload) => {
    const { data } = await api.post("/ground-expenses", payload);
    return data;
};
export const submitGroundExpense = async (id, action) => {
    const { data } = await api.post(`/ground-expenses/${id}/submit`, action);
    return data;
};
export const approveGroundExpense = async (id, action) => {
    const { data } = await api.post(`/ground-expenses/${id}/approve`, action);
    return data;
};
export const rejectGroundExpense = async (id, action) => {
    const { data } = await api.post(`/ground-expenses/${id}/reject`, action);
    return data;
};
export const deleteGroundExpense = async (id) => {
    const { data } = await api.delete(`/ground-expenses/${id}`);
    return data;
};
export const fetchGroundExpenseStats = async (params = {}) => {
    const { data } = await api.get("/ground-expenses-stats/summary", { params });
    return data;
};


// ---------- Phase D: Player Selection Funnel ----------
export const fetchSeasonRegistrations = async (params = {}) => {
    const { data } = await api.get("/season-registrations", { params });
    return data;
};
export const createSeasonRegistration = async (payload) => {
    const { data } = await api.post("/season-registrations", payload);
    return data;
};
export const approveSeasonRegistration = async (id) => {
    const { data } = await api.post(`/season-registrations/${id}/approve`);
    return data;
};
export const rejectSeasonRegistration = async (id, notes) => {
    const { data } = await api.post(`/season-registrations/${id}/reject`, { notes });
    return data;
};
export const fetchSelectionFunnels = async (params = {}) => {
    const { data } = await api.get("/selection-funnels", { params });
    return data;
};
export const fetchSelectionFunnel = async (id) => {
    const { data } = await api.get(`/selection-funnels/${id}`);
    return data;
};
export const createSelectionFunnel = async (payload) => {
    const { data } = await api.post("/selection-funnels", payload);
    return data;
};
export const addPlayersToFunnel = async (id, payload) => {
    const { data } = await api.post(`/selection-funnels/${id}/add-players`, payload);
    return data;
};
export const removePlayerFromFunnel = async (id, payload) => {
    const { data } = await api.post(`/selection-funnels/${id}/remove-player`, payload);
    return data;
};
export const advanceFunnelStage = async (id, payload) => {
    const { data } = await api.post(`/selection-funnels/${id}/advance`, payload);
    return data;
};
export const divisionRecommendFunnel = async (id, payload) => {
    const { data } = await api.post(`/selection-funnels/${id}/division-recommend`, payload);
    return data;
};
export const mpcaValidateFunnel = async (id, payload) => {
    const { data } = await api.post(`/selection-funnels/${id}/mpca-validate`, payload);
    return data;
};
export const submitFunnelToBCCI = async (id, payload) => {
    const { data } = await api.post(`/selection-funnels/${id}/submit-to-bcci`, payload);
    return data;
};
export const deleteSelectionFunnel = async (id) => {
    const { data } = await api.delete(`/selection-funnels/${id}`);
    return data;
};
export const fetchFunnelStats = async (params = {}) => {
    const { data } = await api.get("/selection-funnels-stats/summary", { params });
    return data;
};


