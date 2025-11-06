import { Card, Accordion } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";
import DeviceAccordionItem from "./DeviceAccordionItem";

export default function DeviceOverview() {
  const { groupState } = useDataContext();

  return (
    <div className="mb-4">
      <h6 className="fw-bold mb-3">Device Configuration</h6>
      {groupState.devices.length === 0 ? (
        <Card className="text-center text-muted fst-italic p-3">
          No devices connected.
        </Card>
      ) : (
        <Accordion alwaysOpen>
          {groupState.devices.map((device, i) => (
            <DeviceAccordionItem
              key={device.id || i}
              eventKey={String(i)}
              device={device}
            />
          ))}
        </Accordion>
      )}
    </div>
  );
}
