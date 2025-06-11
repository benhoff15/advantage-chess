import { useState } from "react";
import { ADVANTAGE_POOL } from "../shared/advantages";

const rarityStyles: Record<string, React.CSSProperties> = {
  common: { backgroundColor: "#f0f0f0", borderLeft: "5px solid silver" },
  rare: { backgroundColor: "#fff8dc", borderLeft: "5px solid gold" },
  legendary: { backgroundColor: "#f3e8ff", borderLeft: "5px solid purple" },
};

const GlossaryPage = () => {
  const [rarityFilter, setRarityFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAdvantages = ADVANTAGE_POOL.filter((adv) => {
    const matchesRarity = rarityFilter === "all" || adv.rarity === rarityFilter;
    const matchesSearch =
      adv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adv.description.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesRarity && matchesSearch;
  });

  return (
    <div>
      <h2>🧠 Advantage Glossary</h2>

      {/* Filters */}
      <div style={{ margin: "1rem 0", display: "flex", gap: "1rem" }}>
        <input
          type="text"
          placeholder="Search advantages..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: "0.5rem", flexGrow: 1 }}
        />
        <select
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value)}
          style={{ padding: "0.5rem" }}
        >
          <option value="all">All Rarities</option>
          <option value="common">Common</option>
          <option value="rare">Rare</option>
          <option value="legendary">Legendary</option>
        </select>
      </div>

      {/* Advantage Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        {filteredAdvantages.map((adv) => (
          <div key={adv.id} style={{ ...rarityStyles[adv.rarity], padding: "1rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 0.5rem" }}>{adv.name}</h3>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>{adv.description}</p>
            <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#555" }}>
              {adv.rarity.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* No Matches */}
      {filteredAdvantages.length === 0 && (
        <p style={{ marginTop: "2rem", textAlign: "center", color: "#888" }}>
          No advantages found.
        </p>
      )}
    </div>
  );
};

export default GlossaryPage;
