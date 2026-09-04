const dispatchMessage = (type: string, payload?: any) => {
  self.postMessage({ type, payload });
};

export { dispatchMessage };
