import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../stores/chatStore";

const API_URL = import.meta.env.VITE_BRIDGE_URL || "https://foreman.beverlyhillscop.io";
const API_TOKEN = import.meta.env.VITE_BRIDGE_TOKEN || "1ba489d45352894d3b6b74121a498a826cf8252490119d29127add4d0c00c4e3";

export const ChatPanel = () => {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, addMessage, setLoading } = useChatStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    const userQuery = inputValue.trim();
    setInputValue("");
    addMessage("user", userQuery);
    setLoading(true);

    try {
      // Build history from store (last 10 messages for context)
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(API_URL + "/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + API_TOKEN,
        },
        body: JSON.stringify({ message: userQuery, history }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("assistant", "Error: " + (err.error || res.statusText));
      } else {
        const data = await res.json();
        addMessage("assistant", data.content || "No response.");
      }
    } catch (err) {
      addMessage("assistant", "Connection error: " + (err instanceof Error ? err.message : "Unknown"));
    }

    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="font-mono text-xs text-[#555]">Ask me anything about your projects, tasks, or knowledge base.</div>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-0.5">
            <div className={"font-sans text-[10px] uppercase tracking-wide " + (message.role === "user" ? "text-[#666]" : "text-[#FF6B2B]")}>
              {message.role === "user" ? "You" : "Smartass"}
            </div>
            <div className={"text-xs leading-relaxed break-words " + (message.role === "user" ? "text-[#ccc]" : "text-[#ccc] font-mono")}>
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex flex-col gap-0.5">
            <div className="font-sans text-[10px] uppercase tracking-wide text-[#FF6B2B]">Smartass</div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-[#FF6B2B] rounded-full animate-pulse" />
              <span className="font-mono text-xs text-[#666]">thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-2 border-t border-[#333]">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ask Smartass..."
          disabled={isLoading}
          className="w-full bg-[#0a0a0a] border border-[#333] text-[#e0e0e0] placeholder-[#555] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#FF6B2B] disabled:opacity-50"
        />
      </div>
    </div>
  );
};
