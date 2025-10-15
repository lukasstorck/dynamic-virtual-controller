import { useDataContext } from "./hooks/useDataContext";
import Sidebar from "./components/Sidebar/Sidebar";
import { Container, Row, Col } from "react-bootstrap";

export default function App() {
  const { user, isConnected, websocket } = useDataContext();

  return (
    <Container fluid className="py-4 bg-light">
      <Row>
        <Col md={3}>
          <Sidebar />
        </Col>

        <Col md={9}>
          <h1 className="text-center mb-4">Dynamic Virtual Controller</h1>

          <p>
            <strong>WebSocket:</strong> {websocket?.url ?? "N/A"}
          </p>
          <p>
            <strong>Connected:</strong> {isConnected ? "true" : "false"}
          </p>
          <p>
            <strong>User:</strong> {user?.name ?? "No name found"}
          </p>
        </Col>
      </Row>
    </Container>
  );
}
