import { createContext, useContext, useEffect, useState } from 'react';

// Shared chat state so BOTH the chat sidebar and the article Dashboard can read
// it (the Dashboard saves the conversation as part of the session, and restores
// it when a session is opened). Mirrors to localStorage for reload safety.
const CHAT_KEY = 'hudhud:chat';

function loadChat() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY)) || {};
  } catch {
    return {};
  }
}

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState(() => loadChat().messages || []);
  const [model, setModel] = useState(() => loadChat().model || '');

  useEffect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify({ messages, model }));
  }, [messages, model]);

  return (
    <ChatContext.Provider value={{ messages, setMessages, model, setModel }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
