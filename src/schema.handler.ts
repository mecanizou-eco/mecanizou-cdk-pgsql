import format from "pg-format";
import { getConnectedClient, validateConnection, hashCode } from "./util";
import * as postgres from "./postgres";

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from "aws-lambda/trigger/cloudformation-custom-resource";
import { Connection } from "./lambda.types";

interface Props {
  ServiceToken: string;
  Connection: Connection;
  Name: string;
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  switch (event.RequestType) {
    case "Create":
      return handleCreate(event);
    case "Update":
      return handleUpdate(event);
    case "Delete":
      return handleDelete(event);
  }
};

const generatePhysicalId = (props: Props): string => {
  const { Host, Port } = props.Connection;
  const suffix = Math.abs(hashCode(`${Host}-${Port}`));
  return `${props.Name}-${suffix}`;
};

const handleCreate = async (event: CloudFormationCustomResourceCreateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await createSchema({
    connection: props.Connection,
    name: props.Name,
  });
  return {
    PhysicalResourceId: generatePhysicalId(props),
  };
};

const handleUpdate = async (event: CloudFormationCustomResourceUpdateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  const oldProps = event.OldResourceProperties as Props;

  const oldPhysicalResourceId = generatePhysicalId(oldProps);
  const physicalResourceId = generatePhysicalId(props);

  if (physicalResourceId != oldPhysicalResourceId) {
    await createSchema({
      connection: props.Connection,
      name: props.Name,
    });
    return { PhysicalResourceId: physicalResourceId };
  }

  return { PhysicalResourceId: physicalResourceId };
};

const handleDelete = async (event: CloudFormationCustomResourceDeleteEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await deleteSchema(props.Connection, props.Name);
  return {};
};

const validateProps = (props: Props) => {
  if (!("Connection" in props)) {
    throw "Connection property is required";
  }
  validateConnection(props.Connection);

  if (!("Name" in props)) {
    throw "Name property is required";
  }
};

export const createSchema = async (props: {
  connection: Connection;
  name: string;
}) => {
  const { connection, name } = props;
  console.log("Creating schema", name);
  const client = await getConnectedClient(connection);

  await postgres.createSchema({ client, name });
  await client.end();
  console.log("Created schema");
};

export const deleteSchema = async (
  connection: Connection,
  name: string,
) => {
  console.log("Deleting schema", name);
  const client = await getConnectedClient(connection);

  // First, drop all remaining DB connections
  // Sometimes, DB connections are still alive even though the ECS service has been deleted
  await client.query(
    format(
      "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE datname=%L",
      name
    )
  );
  // Then, drop the DB
  await client.query(format("DROP SCHEMA IF EXISTS %I", name));
  await client.end();
};