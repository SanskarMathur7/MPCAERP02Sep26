import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API_BASE,
    timeout: 20000,
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
export const approvePlayer = async (id) => {
    const { data } = await api.post(`/players/${id}/approve`);
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
export const fetchTournamentStats = async () => {
    const { data } = await api.get("/tournaments-stats/summary");
    return data;
};
