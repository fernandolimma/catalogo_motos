const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const campaign: Record<string, string> = {};

export function captureCampaignParams() {
  const search = new URLSearchParams(window.location.search);
  for (const key of campaignKeys) {
    const value = search.get(key);
    if (value) campaign[key] = value.slice(0, 200);
  }
}

export function getCampaignParams() {
  return { ...campaign };
}
