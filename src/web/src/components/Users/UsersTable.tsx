import { Table } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";
import UserRow from "./UserRow";

export default function UserTable() {
  const { groupState } = useDataContext();

  if (!groupState.users || groupState.users.length === 0) {
    return (
      <div className="text-center text-muted py-3">
        No users connected
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <Table bordered hover className="align-middle">
        <thead className="table-light">
          <tr>
            <th>Name</th>
            <th>Last Activity</th>
            <th>Ping</th>
            <th>Connected Output Devices</th>
          </tr>
        </thead>
        <tbody>
          {groupState.users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </tbody>
      </Table>
    </div>
  );
}
