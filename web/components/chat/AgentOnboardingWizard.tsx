"use client";
import { useState } from "react";
import { UserAgent, AgentGoals } from "@/lib/types";
import { X, Check } from "lucide-react";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#2da9e9",
  anthropic: "#0ec8a2",
  gemini: "#ff9e2a",
};

const GENERIC_GOALS = [
  "Get quick, accurate answers to daily questions",
  "Draft and refine written content",
  "Plan and break down complex tasks",
  "Brainstorm and explore new ideas",
  "Analyze problems and get structured advice",
  "Prepare for meetings and important decisions",
];

function deriveGoals(agent: UserAgent): string[] {
  const desc = ((agent.description ?? "") + " " + agent.name).toLowerCase();
  const goals = [...GENERIC_GOALS];
  if (desc.includes("sales") || desc.includes("prospect")) {
    goals[0] = "Handle objections and close deals faster";
    goals[1] = "Write compelling outreach and follow-ups";
  } else if (desc.includes("marketing") || desc.includes("campaign")) {
    goals[0] = "Create compelling marketing content";
    goals[1] = "Develop winning campaign strategies";
  } else if (desc.includes("hr") || desc.includes("people") || desc.includes("employee")) {
    goals[0] = "Handle HR situations with confidence";
    goals[1] = "Write clear policies and communications";
  } else if (desc.includes("finance") || desc.includes("budget")) {
    goals[0] = "Analyze financial data and build forecasts";
    goals[1] = "Prepare reports and business cases";
  } else if (desc.includes("project") || desc.includes("manager")) {
    goals[0] = "Track and manage projects efficiently";
    goals[1] = "Communicate updates to stakeholders";
  } else if (desc.includes("coach") || desc.includes("training") || desc.includes("skill")) {
    goals[0] = "Build targeted skills and capabilities";
    goals[1] = "Get structured feedback and guidance";
  }
  return goals;
}

export default function AgentOnboardingWizard({
  agent,
  initialGoals,
  mode,
  onComplete,
  onSkip,
}: {
  agent: UserAgent;
  initialGoals: AgentGoals | null;
  mode: "onboarding" | "checkin";
  onComplete: (data: Partial<AgentGoals>) => void;
  onSkip: () => void;
}) {
  const suggestedGoals = deriveGoals(agent);
  const [step, setStep] = useState(0);
  const [selectedGoals, setSelectedGoals] = useState<string[]>(initialGoals?.goals ?? []);
  const [customGoal, setCustomGoal] = useState("");
  const [contextNote, setContextNote] = useState(initialGoals?.context_note ?? "");
  const [stylePreference, setStylePreference] = useState<"brief" | "balanced" | "detailed">(
    initialGoals?.style_preference ?? "balanced"
  );

  const agentColor = PROVIDER_COLORS[agent.provider] ?? "#4e73df";

  // onboarding: steps = [welcome(0), goals(1), context(2), style(3), done(4)]
  // checkin:    steps = [goals(0), context(1), done(2)]
  const steps = mode === "onboarding"
    ? ["Welcome", "Goals", "Context", "Style", "Done"]
    : ["Goals", "Context", "Done"];
  const totalSteps = steps.length;
  const progressPct = ((step + 1) / totalSteps) * 100;

  // Map step index to logical step name
  const currentStepName = steps[step];

  function toggleGoal(goal: string) {
    setSelectedGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  }

  function addCustomGoal() {
    const t = customGoal.trim();
    if (t && !selectedGoals.includes(t)) {
      setSelectedGoals(prev => [...prev, t]);
    }
    setCustomGoal("");
  }

  function handleComplete() {
    const now = new Date().toISOString();
    const data: Partial<AgentGoals> = {
      goals: selectedGoals,
      context_note: contextNote,
      style_preference: stylePreference,
    };
    if (mode === "onboarding") {
      data.onboarding_completed_at = now;
    } else {
      data.last_checkin_at = now;
    }
    onComplete(data);
  }

  function renderStepContent() {
    switch (currentStepName) {
      case "Welcome":
        return (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: agentColor, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, fontWeight: 700, color: "#fff",
              margin: "0 auto 20px",
              boxShadow: `0 0 0 4px ${agentColor}20`,
            }}>
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#1e2b3a" }}>
              Meet {agent.name}
            </h2>
            {agent.description && (
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7a8d", lineHeight: 1.6 }}>
                {agent.description}
              </p>
            )}
            <p style={{ margin: 0, fontSize: 13, color: "#a0aab4" }}>
              Let&apos;s set up your workspace so {agent.name} can give you the most relevant help.
            </p>
          </div>
        );

      case "Goals":
        return (
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#1e2b3a" }}>
              {mode === "checkin" ? "Review your goals" : "What are you working on?"}
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7a8d" }}>
              Select goals that apply — {agent.name} will personalize help for these.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {suggestedGoals.map(goal => {
                const selected = selectedGoals.includes(goal);
                return (
                  <button
                    key={goal}
                    onClick={() => toggleGoal(goal)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 8, textAlign: "left",
                      border: `1px solid ${selected ? agentColor : "#e8edf2"}`,
                      background: selected ? `${agentColor}10` : "#fafbfc",
                      color: selected ? agentColor : "#4a5568", cursor: "pointer",
                      fontSize: 13, fontWeight: selected ? 600 : 400, transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${selected ? agentColor : "#c5d0d8"}`,
                      background: selected ? agentColor : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                    {goal}
                  </button>
                );
              })}
            </div>
            {/* Custom goal */}
            {selectedGoals.filter(g => !suggestedGoals.includes(g)).map(g => (
              <div key={g} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                borderRadius: 8, background: `${agentColor}10`, border: `1px solid ${agentColor}`,
                marginBottom: 6,
              }}>
                <span style={{ flex: 1, fontSize: 13, color: agentColor, fontWeight: 600 }}>{g}</span>
                <button onClick={() => setSelectedGoals(prev => prev.filter(x => x !== g))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: agentColor, padding: 0, display: "flex" }}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <input
                value={customGoal}
                onChange={e => setCustomGoal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addCustomGoal(); }}
                placeholder="Add your own goal…"
                style={{
                  flex: 1, padding: "8px 12px", fontSize: 13, borderRadius: 6,
                  border: "1px solid #e2e8f0", outline: "none",
                }}
              />
              <button
                onClick={addCustomGoal}
                disabled={!customGoal.trim()}
                style={{
                  padding: "8px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: "none", background: agentColor, color: "#fff", cursor: "pointer",
                  opacity: customGoal.trim() ? 1 : 0.4,
                }}
              >
                Add
              </button>
            </div>
          </div>
        );

      case "Context":
        return (
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#1e2b3a" }}>
              Your role and context
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#6b7a8d" }}>
              Help {agent.name} understand your role. This makes responses much more relevant.
            </p>
            <textarea
              value={contextNote}
              onChange={e => setContextNote(e.target.value.slice(0, 300))}
              placeholder={`e.g. "I'm a sales manager at a B2B SaaS company with a team of 6 reps, focused on enterprise deals."`}
              rows={5}
              style={{
                width: "100%", padding: "10px 14px", fontSize: 13, borderRadius: 8,
                border: "1px solid #e2e8f0", outline: "none",
                fontFamily: "inherit", resize: "none", lineHeight: 1.6,
                boxSizing: "border-box", color: "#2d3748",
              }}
            />
            <div style={{ textAlign: "right", fontSize: 11, color: "#b0bec5", marginTop: 4 }}>
              {contextNote.length}/300
            </div>
          </div>
        );

      case "Style":
        return (
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#1e2b3a" }}>
              Preferred response style
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7a8d" }}>
              How should {agent.name} respond to you by default?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { value: "brief", label: "Brief", desc: "Short, direct answers — just the essentials" },
                { value: "balanced", label: "Balanced", desc: "Clear explanations with appropriate detail" },
                { value: "detailed", label: "Detailed", desc: "Thorough responses with context and examples" },
              ] as const).map(opt => {
                const selected = stylePreference === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setStylePreference(opt.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", borderRadius: 8, textAlign: "left",
                      border: `1px solid ${selected ? agentColor : "#e8edf2"}`,
                      background: selected ? `${agentColor}10` : "#fafbfc",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${selected ? agentColor : "#c5d0d8"}`,
                      background: selected ? agentColor : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: selected ? agentColor : "#2d3748" }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: "#6b7a8d" }}>{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case "Done":
        return (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "#d4edda", display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px", fontSize: 28,
            }}>
              ✅
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#1e2b3a" }}>
              {mode === "checkin" ? "Goals updated!" : "You're all set!"}
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7a8d", lineHeight: 1.6 }}>
              {mode === "checkin"
                ? `${agent.name} will use your updated goals and preferences.`
                : `${agent.name} is ready to help you with ${selectedGoals.length > 0 ? selectedGoals[0].toLowerCase() : "your work"} and more.`}
            </p>
            {selectedGoals.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 8 }}>
                {selectedGoals.slice(0, 4).map(g => (
                  <span key={g} style={{
                    padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                    background: `${agentColor}15`, color: agentColor, border: `1px solid ${agentColor}30`,
                  }}>
                    {g.length > 30 ? g.slice(0, 30) + "…" : g}
                  </span>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  const isLast = step === totalSteps - 1;
  const isFirst = step === 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(3px)",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%",
        maxWidth: 520, margin: "0 20px", overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
      }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: "#f0f4f8" }}>
          <div style={{
            height: "100%", background: agentColor,
            width: `${progressPct}%`, transition: "width 0.3s ease",
          }} />
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "12px 0 0" }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 6, height: 6, borderRadius: 3,
              background: i <= step ? agentColor : "#e2e8f0",
              transition: "all 0.3s",
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "20px 32px 8px" }}>
          {renderStepContent()}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 32px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          {/* Skip (only on welcome step) */}
          {mode === "onboarding" && isFirst && (
            <button
              onClick={onSkip}
              style={{
                fontSize: 13, color: "#a0aab4", background: "none", border: "none",
                cursor: "pointer", padding: "8px 0", marginRight: "auto",
              }}
            >
              Skip for now
            </button>
          )}
          {/* Back */}
          {!isFirst && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                border: "1px solid #e2e8f0", background: "#fff", color: "#6b7a8d",
                cursor: "pointer", marginRight: "auto",
              }}
            >
              Back
            </button>
          )}
          {/* Next / Finish */}
          {isLast ? (
            <button
              onClick={handleComplete}
              style={{
                padding: "9px 28px", fontSize: 14, fontWeight: 700, borderRadius: 8,
                border: "none", background: agentColor, color: "#fff",
                cursor: "pointer", boxShadow: `0 4px 14px ${agentColor}50`,
                marginLeft: mode === "onboarding" && !isFirst ? 0 : "auto",
              }}
            >
              {mode === "checkin" ? "Save & continue" : "Start chatting →"}
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                padding: "9px 24px", fontSize: 13, fontWeight: 700, borderRadius: 8,
                border: "none", background: agentColor, color: "#fff",
                cursor: "pointer",
                marginLeft: mode === "onboarding" && isFirst ? 0 : "auto",
              }}
            >
              Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
