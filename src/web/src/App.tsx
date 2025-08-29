import { useDataContext } from "./hooks/useDataContext";

export default function App() {
  const { user } = useDataContext();

  return (
    <div className="container-fluid py-4">
      <h1 className="text-center mb-4">Dynamic Virtual Controller</h1>
      <span>{user?.name ?? "no name found"}</span>

      <p className="text-center text-gray-600">
        React + Vite project scaffolded. Start adding components in{" "}
        <code>src/components/</code>.
      </p>
    </div>
  );
}
