import { API_MODE, ENDPOINTS } from "../config.js";
import { requireSession } from "../store.js";

const DEFAULT_AWARDS = [
  {
    id: "award-10000",
    goal: 10000,
    title: "Premiação 1",
    description: "R$ 10.000,00 em saques sobre ganhos em operações.",
    rewards: ["Reconhecimento de nível inicial"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 10.000",
  },
  {
    id: "award-100000",
    goal: 100000,
    title: "Premiação 2",
    description: "R$ 100.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 caneca personalizada"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 100.000",
  },
  {
    id: "award-500000",
    goal: 500000,
    title: "Premiação 3",
    description: "R$ 500.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 MacBook M2"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 500.000",
  },
  {
    id: "award-1000000",
    goal: 1000000,
    title: "Premiação 4",
    description: "R$ 1.000.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 MacBook M2", "Viagem para o Chile (2 pessoas, tudo pago)"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 1.000.000",
  },
];

export async function getAwardsConfig() {
  const session = requireSession();

  if (API_MODE === "real") {
    try {
      const response = await fetch(ENDPOINTS.awards, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (response.ok) {
        return response.json();
      }
    } catch {
      // fallback local abaixo
    }
  }

  return DEFAULT_AWARDS;
}
