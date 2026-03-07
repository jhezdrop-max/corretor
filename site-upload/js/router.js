const subscribers = new Set();

function normalize(path) {
  if (!path) return "/auth";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getCurrentRoute() {
  const hash = window.location.hash.replace(/^#/, "");
  return normalize(hash || "/auth");
}

export function navigate(path) {
  const normalized = normalize(path);
  const nextHash = `#${normalized}`;

  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }

  subscribers.forEach((callback) => callback(normalized));
}

export function onRouteChange(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function initRouter() {
  window.addEventListener("hashchange", () => {
    const route = getCurrentRoute();
    subscribers.forEach((callback) => callback(route));
  });

  if (!window.location.hash) {
    navigate("/auth");
  } else {
    const route = getCurrentRoute();
    subscribers.forEach((callback) => callback(route));
  }
}
