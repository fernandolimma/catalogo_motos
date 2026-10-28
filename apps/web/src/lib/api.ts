import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3001/api/v1",
  withCredentials: true,
  timeout: 12000,
  headers: { "Content-Type": "application/json" },
});

export function errorMessage(error: unknown) {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? "Não foi possível concluir. Tente novamente.";
  }
  return "Não foi possível concluir. Tente novamente.";
}
