import { useEffect, useState, type FC } from "react";
import { type User } from "../../types";
import { formatLastActivity, formatPing } from "../../utils/formatting";

interface Props {
  user: User;
}

const UserRow: FC<Props> = ({ user }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <tr>
      <td>
        <span
          className="d-inline-block rounded-circle me-2"
          style={{
            backgroundColor: user.color,
            width: 12,
            height: 12,
          }}
        />
        {user.name}
      </td>
      <td>{formatLastActivity(user.last_activity)}</td>
      <td>{formatPing(user.ping)}</td>
      <td>
        {user.selected_output_devices?.length
          ? user.selected_output_devices.join(", ")
          : "None"}
      </td>
    </tr>
  );
};

export default UserRow;
