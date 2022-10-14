import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Provider } from "./provider";

export interface SchemaProps {
  /**
   * Provider required to connect to the Postgresql server
   */
  provider: Provider;

  /**
   * The name of the schema. Must be unique on the PostgreSQL server instance where it is configured.
   */
  name: string;

  /**
   * Policy to apply when the database is removed from this stack.
   *
   * @default - The database will be orphaned.
   */
  removalPolicy?: RemovalPolicy;
}

export class Schema extends Construct {
  constructor(scope: Construct, id: string, props: SchemaProps) {
    super(scope, id);

    const { provider, name, removalPolicy } = props;

    const cr = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::Postgresql-Schema",
      properties: {
        connection: provider.buildConnectionProperty(),
        name,
      },
      pascalCaseProperties: true,
    });

    cr.applyRemovalPolicy(removalPolicy || cdk.RemovalPolicy.RETAIN);
    cr.node.addDependency(provider);
  }
}
