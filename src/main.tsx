import { NDKHeadless, NDKSessionLocalStorage } from '@nostr-dev-kit/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';
import { DEFAULT_RELAYS } from './nostr/config';
import { WalletProvider } from './wallet/WalletProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NDKHeadless
      ndk={{
        explicitRelayUrls: DEFAULT_RELAYS,
        clientName: '1btc',
        autoConnectUserRelays: true,
      }}
      session={{
        storage: new NDKSessionLocalStorage(),
        opts: { follows: true, profile: true },
      }}
    />
    <BrowserRouter>
      <WalletProvider>
        <App />
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
);
