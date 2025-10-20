import Sidebar from "./components/Sidebar/Sidebar";
import { Container, Row, Col, Card } from "react-bootstrap";
import UserTable from "./components/Users/UsersTable";
import DeviceGrid from "./components/Devices/DeviceGrid";
import { useDataContext } from "./hooks/useDataContext";
import { useEffect } from "react";

export default function App() {
  const { handleKeyPress } = useDataContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyPress(event, 1);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      handleKeyPress(event, 0);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyPress]);

  return (
    <Container fluid className="py-4 bg-light">
      <Row>
        <Col md={3}>
          <Sidebar />
        </Col>

        <Col md={9}>
          <h1 className="text-center mb-4">Dynamic Virtual Controller</h1>

          {/* Connected Users */}
          <Card className="p-3 shadow-sm mb-4">
            <h5>Connected Users</h5>
            <UserTable />
          </Card>

          {/* Connected Output Devices */}
          <Card className="p-3 shadow-sm mb-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">Connected Output Devices</h5>
            </div>
            <DeviceGrid />
          </Card>
        </Col>
      </Row>

      {/* TODO: add keybind editor modal */}
    </Container>
  );
}
