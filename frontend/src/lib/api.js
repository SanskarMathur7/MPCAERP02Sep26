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
