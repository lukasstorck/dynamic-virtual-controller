import { Row, Col } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";
import DeviceCard from "./DeviceCard";

export default function DeviceGrid() {
  const { devices } = useDataContext();

  if (!devices || devices.length === 0) {
    return (
      <div className="text-center text-muted py-3">
        No output devices connected
      </div>
    );
  }

  return (
    <Row xs={1} sm={2} md={3} lg={3} className="g-3">
      {devices.map((device) => (
        <Col key={device.id}>
          <DeviceCard device={device} />
        </Col>
      ))}
    </Row>
  );
}
