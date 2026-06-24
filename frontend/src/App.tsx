import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Staking from "./pages/Staking";
import Marketplace from "./pages/Marketplace";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/staking" element={<Staking />} />
        <Route path="/marketplace" element={<Marketplace />} />
      </Route>
    </Routes>
  );
}
