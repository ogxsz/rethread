export const VERSION = '1.4.0';

export const MESSAGE_TYPES = {
  SAVE_CHAT: 'SAVE_CHAT',
  GET_CURRENT_CHAT: 'GET_CURRENT_CHAT',
  CURRENT_CHAT_UPDATE: 'CURRENT_CHAT_UPDATE',
  UPDATE_CHAT: 'UPDATE_CHAT',
  DELETE_CHAT: 'DELETE_CHAT',
  CREATE_FOLDER: 'CREATE_FOLDER',
  DELETE_FOLDER: 'DELETE_FOLDER'
};

export const STORAGE_KEYS = {
  CHATS: 'chats',
  SETTINGS: 'settings',
  META: 'meta',
  FOLDERS: 'folders'
};

export const DEFAULTS = {
  settings: {
    onboardingDone: false,
    theme: 'auto',
    sortBy: 'savedAt',
    version: VERSION
  },
  meta: {
    version: VERSION,
    totalChats: 0
  },
  folders: []
};
