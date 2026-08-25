import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { HomePage } from "./pages/HomePage";
import { PatternsPage } from "./pages/PatternsPage";
import { PatternDetailPage } from "./pages/PatternDetailPage";
import { ProblemPage } from "./pages/ProblemPage";
import { AboutPage } from "./pages/AboutPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/** Route table, router-agnostic (tests mount with MemoryRouter). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/patterns" element={<PatternsPage />} />
        <Route path="/patterns/:slug" element={<PatternDetailPage />} />
        <Route path="/problem/:slug" element={<ProblemPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
