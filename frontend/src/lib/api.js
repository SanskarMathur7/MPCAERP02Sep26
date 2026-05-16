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
