import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, X, ChevronDown, Sparkles, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AiCoachProps {
  mode: string;
  elapsed: number;
  matchNumber: number;
  weighInWeight: string;
  currentWeight: number;
  lostWeight: number;
  currentPhase: string;
  phasePriority: string;
  checklist: Record<string, boolean>;
}

interface Message {
  role: "user" | "assistant" | "error";
  content: string;
}

const QUICK_PROMPTS = [
  "What should I eat right now?",
  "Am I hydrating enough?",
  "How should I prep for my next match?",
  "I feel sluggish, what do I do?",
];

export function AiCoach({
  mode, elapsed, matchNumber, weighInWeight,
  currentWeight, lostWeight, currentPhase, phasePriority, checklist
}: AiCoachProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if AI is available on first expand
  useEffect(() => {
    if (expanded && aiAvailable === null) {
      checkAiAvailability();
    }
  }, [expanded]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkAiAvailability = async () => {
    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "ping" }),
      });
      // 503 means not configured, anything else means it's available
      setAiAvailable(res.status !== 503);
    } catch {
      setAiAvailable(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const completedTasks = Object.entries(checklist)
        .filter(([_, done]) => done)
        .map(([id]) => id)
        .join(", ");

      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          mode,
          elapsed,
          matchNumber,
          weighInWeight,
          currentWeight,
          lostWeight,
          currentPhase,
          phasePriority,
          checklist: completedTasks || "None yet",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Failed to get recommendation");
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.recommendation }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "error",
        content: err.message || "Something went wrong. Try again.",
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="border border-purple-500/20 bg-purple-500/5 rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) setTimeout(() => inputRef.current?.focus(), 200);
        }}
        className="w-full flex items-center justify-between p-3 active:bg-purple-500/10 transition-colors"
      >
        <span className="text-[10px] uppercase font-bold text-purple-500 flex items-center gap-1.5 tracking-wider">
          <Sparkles className="w-3.5 h-3.5" /> AI Recovery Coach
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
          {/* AI not available message */}
          {aiAvailable === false && (
            <div className="bg-muted/20 rounded-lg p-3 text-center space-y-1">
              <Bot className="w-6 h-6 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">
                AI coach requires an API key. Add <code className="bg-muted px-1 rounded text-[10px]">ANTHROPIC_API_KEY</code> to your environment variables.
              </p>
            </div>
          )}

          {/* Chat area */}
          {aiAvailable !== false && (
            <>
              {/* Messages */}
              {messages.length > 0 && (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-purple-500/15 text-foreground ml-8"
                          : msg.role === "error"
                          ? "bg-destructive/10 text-destructive mr-8"
                          : "bg-background/50 text-foreground mr-4"
                      )}
                    >
                      {msg.role === "assistant" && (
                        <span className="text-[9px] uppercase font-bold text-purple-500 block mb-1">
                          AI Coach
                        </span>
                      )}
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                  {loading && (
                    <div className="bg-background/50 rounded-lg px-3 py-2 mr-4 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Quick prompts (only if no messages yet) */}
              {messages.length === 0 && !loading && (
                <div className="space-y-1">
                  <p className="text-[9px] uppercase text-muted-foreground tracking-wider px-1">
                    Quick questions
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_PROMPTS.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(prompt)}
                        className="text-left bg-background/50 hover:bg-background/80 rounded-lg px-2.5 py-2 text-[11px] text-foreground transition-colors active:scale-[0.98]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask about food, hydration, recovery..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  className="flex-1 h-10 text-sm rounded-lg bg-background/60"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className={cn(
                    "p-2.5 rounded-lg transition-all active:scale-95 shrink-0",
                    input.trim() && !loading
                      ? "bg-purple-500 text-white"
                      : "bg-muted/30 text-muted-foreground"
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
