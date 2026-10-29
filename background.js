// Clic sur l'icône de l'extension : ouvre l'interface Omnivox+ dans un nouvel onglet.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});
