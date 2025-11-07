import Sidebar from "./components/Sidebar/Sidebar";
import { Container, Row, Col, Card } from "react-bootstrap";
import UserTable from "./components/Users/UsersTable";
import DeviceGrid from "./components/Devices/DeviceGrid";
import KeybindEditor from "./components/KeymapEditor/KeybindEditor";

export default function App() {
  return (
    <Container fluid className="py-4 bg-light">
      <h1 className="text-center mb-4">Dynamic Virtual Controller</h1>
      <Row>
        <Col md={3}>
          <Sidebar />
        </Col>

        <Col md={9}>
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

      <KeybindEditor />
    </Container>
  );
}
