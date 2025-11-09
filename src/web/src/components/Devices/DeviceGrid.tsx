import { Col, Row } from "react-bootstrap";

import DeviceCard from "./DeviceCard";
import { useDataContext } from "../../hooks/useDataContext";

export default function DeviceGrid() {
  const { groupState } = useDataContext();

  if (!groupState.devices || groupState.devices.length === 0) {
    return (
      <div className="text-center text-muted py-3">
        No output devices available
      </div>
    );
  }

  return (
    <Row xs={1} sm={2} md={3} lg={3} className="g-3">
      {groupState.devices.map((device) => (
        <Col key={device.id}>
          <DeviceCard device={device} />
        </Col>
      ))}
    </Row>
  );
}
