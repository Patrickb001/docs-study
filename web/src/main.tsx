import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './App';

// The local server. Change VITE_API_URL in web/.env if you moved it to another port.
const client = new ApolloClient({
  link: new HttpLink({ uri: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000/' }),
  // Parts in different designs share ids such as "orders", so they must not be merged in the cache.
  cache: new InMemoryCache({ typePolicies: { DesignPart: { keyFields: false } } }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  </StrictMode>,
);
